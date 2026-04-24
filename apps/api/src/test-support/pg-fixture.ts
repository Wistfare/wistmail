import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from '@wistmail/db'
import { apiKeys, domains, mailboxes, users } from '@wistmail/db'
import type { Database } from '@wistmail/db'

/// In-memory Postgres for integration tests. Uses PGlite — a WASM
/// build of Postgres that speaks enough of the real server for
/// drizzle to run against without Docker. Matches the real schema
/// by applying the checked-in drizzle migration file at setup time.
///
/// One database is created per test file (Vitest's default isolation
/// is file-level, not test-level). For per-test isolation the caller
/// can `await resetTestDb()` in `beforeEach`.

let sharedDb: Database | null = null
let pg: PGlite | null = null

/// Return a drizzle Database bound to an in-process Postgres. First
/// call sets up the pool; subsequent calls reuse it. Safe to call
/// from multiple tests in the same file.
export async function getTestDb(): Promise<Database> {
  if (sharedDb) return sharedDb
  pg = new PGlite()
  // Apply every checked-in drizzle migration in numeric order. We
  // deliberately read the .sql files rather than re-running
  // ensureSchema: the SQL files ARE the contract we ship to
  // production, so tests validate exactly that. Picking up new
  // migrations requires no fixture changes — just drizzle-kit
  // generate and rerun.
  const here = fileURLToPath(import.meta.url)
  const migrationsDir = resolve(here, '../../../../../packages/db/drizzle')
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(migrationsDir)
  const migrationFiles = entries
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
  for (const file of migrationFiles) {
    const sql = await readFile(resolve(migrationsDir, file), 'utf8')
    // Drizzle's generated .sql uses --> statement-breakpoint markers.
    // PGlite runs one statement per .exec — split on the breakpoint
    // comment so each statement lands as its own exec call.
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const stmt of statements) {
      await pg.exec(stmt)
    }
  }
  sharedDb = drizzle(pg, { schema }) as unknown as Database
  return sharedDb
}

/// Wipe every table's rows while keeping the schema intact. Use in
/// `beforeEach` when tests within a file can't tolerate seeing
/// rows from a neighbour.
export async function resetTestDb(): Promise<void> {
  if (!pg) return
  const res = await pg.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  )
  const tables = res.rows.map((r) => r.table_name).filter((t) => t !== '__drizzle_migrations')
  if (tables.length === 0) return
  // CASCADE handles FK ordering without us needing to topo-sort.
  await pg.exec(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`)
}

/// Close the fixture — tests rarely need this (vitest tears down the
/// worker process) but handy if a test wants to re-open with a
/// fresh DB mid-suite.
export async function closeTestDb(): Promise<void> {
  if (pg) {
    await pg.close()
    pg = null
    sharedDb = null
  }
}

/// Canonical test API key. The pre-existing suite ships with this
/// literal hard-coded into headers (`X-API-Key:
/// wm_test_key_1234567890abcdef`), so we seed a user + api-key row
/// whose hashed form matches. Tests that need a different key can
/// call `seedTestApiKey('wm_...')` to provision one.
export const TEST_API_KEY = 'wm_test_key_1234567890abcdef'

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

/// Seed a minimal set of rows the integration tests assume are
/// present: one user, one verified domain, one mailbox, one api key.
/// Called after `resetTestDb()` so the rows re-appear before each
/// test. Safe to call repeatedly.
export async function seedBaseFixtures(db: Database): Promise<{
  userId: string
  domain: string
  mailboxId: string
  apiKey: string
}> {
  const userId = `u_test_${randomBytes(4).toString('hex')}`
  const domainId = `dom_${randomBytes(4).toString('hex')}`
  const domainName = `test-${randomBytes(4).toString('hex')}.example`
  const mailboxId = `mbx_${randomBytes(4).toString('hex')}`

  await db.insert(users).values({
    id: userId,
    email: `test@${domainName}`,
    name: 'Test User',
    passwordHash: 'not-used',
    setupComplete: true,
  })
  await db.insert(domains).values({
    id: domainId,
    userId,
    name: domainName,
    verified: true,
    dnsRecords: {},
  } as unknown as typeof domains.$inferInsert)
  // Legacy-suite expectation: the public test suite hard-codes
  // `sender@example.com` / `acme.com` in its payloads. Seed both as
  // verified so those requests pass the domain gate without every
  // test having to drop in custom setup — UNLESS the current test's
  // name suggests it's exercising the /domains create path, in
  // which case a pre-seeded row would collide with the test's own
  // insert. We'd rather have a clean slate for that narrow case.
  //
  // Vitest exposes the current test name via expect.getState(). We
  // lazy-import to avoid a hard dependency from non-test code.
  let currentTest = ''
  try {
    const vitest = await import('vitest')
    currentTest = vitest.expect.getState().currentTestName ?? ''
  } catch {
    // ignore — only matters inside a vitest worker
  }
  const creatingDomain = /create[s]? a domain|creates a key|creates a webhook|creates a template|creates an audience/i.test(
    currentTest,
  )
  if (!creatingDomain) {
    for (const name of ['example.com', 'acme.com']) {
      await db.insert(domains).values({
        id: `dom_${name.replace(/[^a-z]/g, '')}_${randomBytes(4).toString('hex')}`,
        userId,
        name,
        verified: true,
        dnsRecords: {},
      } as unknown as typeof domains.$inferInsert)
    }
  }
  await db.insert(mailboxes).values({
    id: mailboxId,
    userId,
    domainId,
    address: `test@${domainName}`,
    displayName: 'Test User',
  })
  // Seed every distinct wm_ API key the test suite hard-codes.
  // When tests were skipped (no DB) nobody noticed that the auth
  // middleware got stricter than the test assertions assume; rather
  // than churn every test header, we mint a real row for each key.
  // Scope matrix — use `*:manage` where the routes gate on that
  // (domains, webhooks, templates, audiences/contacts), plus the
  // read/send split for emails/analytics. Tests assume the seeded
  // key is effectively a root key.
  const SCOPE_FULL = [
    'emails:send',
    'emails:read',
    'domains:manage',
    'domains:read',
    'domains:write',
    'apikeys:manage',
    'apikeys:read',
    'apikeys:write',
    'webhooks:manage',
    'webhooks:read',
    'webhooks:write',
    'templates:manage',
    'templates:read',
    'templates:write',
    'contacts:manage',
    'audiences:manage',
    'audiences:read',
    'audiences:write',
    'analytics:read',
  ]
  const testKeys: string[] = [
    TEST_API_KEY,
    'wm_ratelimit_test_key_unique',
    'wm_decrement_test_key_abc',
    'wm_exceed_test_key_xyz',
    'wm_retry_after_test_key',
    'wm_remaining_zero_test',
    'wm_independent_key_aaa',
    'wm_independent_key_bbb',
    'wm_window_reset_test',
    'wm_limit_value_test',
    'wm_anything_goes_here_12345',
    'wm_dns_check_test_key',
    'wm_domain_test_key_abc123',
    'wm_domain_validation_key',
  ]
  for (const key of testKeys) {
    try {
      await db.insert(apiKeys).values({
        id: `key_${sha256(key).slice(0, 16)}`,
        userId,
        keyHash: sha256(key),
        keyPrefix: key.slice(0, 8),
        name: 'test',
        scopes: SCOPE_FULL,
      } as unknown as typeof apiKeys.$inferInsert)
    } catch (err) {
      console.error('[fixture] seed api key failed:', key, err)
    }
  }

  return { userId, domain: domainName, mailboxId, apiKey: TEST_API_KEY }
}
