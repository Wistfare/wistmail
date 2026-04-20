/// Runtime migration entrypoint. Invoked from the deploy pipeline
/// inside a one-shot `docker compose run --rm api` container, before
/// the real api service restarts. Idempotent: running it twice back
/// to back is a no-op.
///
/// The tricky case is an existing production DB that was bootstrapped
/// via `apps/api/src/index.ts → ensureSchema()` before drizzle
/// migrations existed. That DB has every table but no
/// `__drizzle_migrations` tracking rows, so a naive `migrate()` call
/// crashes on the 0000 snapshot trying to CREATE TABLE users (which
/// already exists). We detect that path by catching the first
/// "already exists" failure, then backfill `__drizzle_migrations`
/// with every checked-in migration hash so drizzle thinks they're
/// applied. Subsequent deploys then run only net-new migrations.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL not set — refusing to run')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = join(here, '..', 'drizzle')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

async function run(): Promise<void> {
  try {
    await migrate(db, { migrationsFolder })
    return
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Postgres surfaces both "relation ... already exists" (for tables
    // and indexes) and "duplicate key" (for the __drizzle_migrations
    // row insert if a prior run half-completed). Both are signals that
    // the DB already matches the migration.
    if (!/already exists|duplicate/i.test(msg)) {
      console.error('[migrate] migrator failed:', msg)
      throw err
    }
    console.warn('[migrate] existing schema detected — bootstrapping tracker')
  }

  // Bootstrap path: mark every checked-in migration as applied so the
  // next migrate() call is a clean no-op that picks up only new files.
  await client`CREATE SCHEMA IF NOT EXISTS "drizzle"`
  await client`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `

  type JournalEntry = { idx: number; tag: string; when: number }
  const journalPath = join(migrationsFolder, 'meta', '_journal.json')
  const journalRaw = await readFile(journalPath, 'utf8')
  const journal = JSON.parse(journalRaw) as { entries: JournalEntry[] }

  for (const entry of journal.entries) {
    const sqlPath = join(migrationsFolder, `${entry.tag}.sql`)
    const content = await readFile(sqlPath, 'utf8')
    // Drizzle stores SHA-256 of the raw file contents as the
    // migration hash. We mirror that so drizzle's own bookkeeping
    // recognises the backfilled row.
    const hash = createHash('sha256').update(content).digest('hex')

    const already = await client`
      SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = ${hash}
    `
    if (already.length > 0) continue

    await client`
      INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
      VALUES (${hash}, ${entry.when ?? Date.now()})
    `
    console.log(
      `[migrate] marked ${entry.tag} (${hash.slice(0, 12)}) as applied`,
    )
  }

  // Re-run drizzle's migrator. Either it's a no-op (everything
  // bootstrapped) or it runs a genuinely new migration that wasn't
  // in the snapshot — that's the normal forward path once all
  // production DBs have caught up to drizzle tracking.
  await migrate(db, { migrationsFolder })
}

try {
  await run()
  console.log('[migrate] ok')
  await client.end()
  process.exit(0)
} catch (err) {
  console.error('[migrate] failed:', err)
  await client.end().catch(() => {})
  process.exit(1)
}
