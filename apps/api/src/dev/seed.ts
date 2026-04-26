/// Dev-environment seed: applies all checked-in drizzle migrations
/// against the configured DATABASE_URL, then inserts an org + two
/// users with known credentials so a fresh dev DB is immediately
/// usable for click-through testing of chat / mail / search flows.
///
/// Idempotent: re-running drops the seeded user + org first, then
/// re-creates them. Production data on the same DB is left alone
/// (we only delete by the deterministic ids this script writes).
///
/// Usage:
///   DATABASE_URL=postgresql://user:pass@localhost:5432/wistmail \
///     pnpm dev:seed
///
/// Output prints the two seeded credentials so the dev can paste them
/// into the web sign-in form.

import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { eq } from 'drizzle-orm'
import { hash as argonHash } from 'argon2'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  organizations,
  orgMembers,
  users,
  type Database,
} from '@wistmail/db'

const SEED_ORG_ID = 'org_dev_seed'
const SEED_USERS = [
  {
    id: 'u_dev_alice',
    email: 'alice@dev.local',
    name: 'Alice',
    password: 'devpass123',
    role: 'owner' as const,
  },
  {
    id: 'u_dev_bob',
    email: 'bob@dev.local',
    name: 'Bob',
    password: 'devpass123',
    role: 'member' as const,
  },
]

async function applyMigrations(client: postgres.Sql): Promise<void> {
  const here = fileURLToPath(import.meta.url)
  // From apps/api/src/dev/seed.ts up to the repo root, then into
  // packages/db/drizzle.
  const migrationsDir = resolve(here, '../../../../../packages/db/drizzle')
  const entries = await readdir(migrationsDir)
  const files = entries.filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
  for (const file of files) {
    const sql = await readFile(resolve(migrationsDir, file), 'utf8')
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const stmt of statements) {
      try {
        await client.unsafe(stmt)
      } catch (err) {
        // Idempotent re-runs hit "already exists" / "duplicate
        // column" — skip those, fail loud on anything else.
        const msg = (err as Error).message ?? ''
        const recoverable =
          msg.includes('already exists') ||
          msg.includes('duplicate column') ||
          msg.includes('duplicate key')
        if (!recoverable) {
          console.error(`[seed] migration ${file} failed: ${msg}`)
          throw err
        }
      }
    }
  }
}

async function seedOrgAndUsers(db: Database): Promise<void> {
  // Drop our previous seed so re-runs land in a clean state. We use
  // the deterministic ids above so production rows are never touched.
  await db.delete(orgMembers).where(eq(orgMembers.orgId, SEED_ORG_ID))
  await db.delete(organizations).where(eq(organizations.id, SEED_ORG_ID))
  for (const u of SEED_USERS) {
    await db.delete(users).where(eq(users.id, u.id))
  }

  for (const u of SEED_USERS) {
    await db.insert(users).values({
      id: u.id,
      email: u.email,
      name: u.name,
      passwordHash: await argonHash(u.password),
      setupComplete: true,
      // MFA is forced for production users, but the dev seed exists
      // to make click-through testing instant — skip the enrollment
      // bounce on first login.
      mfaRequired: false,
      mfaSetupComplete: true,
    })
  }
  await db.insert(organizations).values({
    id: SEED_ORG_ID,
    name: 'Dev Org',
    slug: 'dev-org',
    ownerId: SEED_USERS[0].id,
  })
  for (const u of SEED_USERS) {
    await db.insert(orgMembers).values({
      id: `om_dev_${u.id}`,
      orgId: SEED_ORG_ID,
      userId: u.id,
      role: u.role,
    })
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[seed] DATABASE_URL is required')
    process.exit(1)
  }

  const client = postgres(url)
  try {
    console.log('[seed] applying migrations…')
    await applyMigrations(client)
    const db = drizzle(client) as unknown as Database
    console.log('[seed] inserting org + users…')
    await seedOrgAndUsers(db)

    console.log('')
    console.log('[seed] done. dev credentials:')
    for (const u of SEED_USERS) {
      console.log(`  ${u.name.padEnd(6)} → email: ${u.email}   password: ${u.password}`)
    }
    console.log('')
  } finally {
    await client.end()
  }
}

void main().catch((err) => {
  console.error('[seed] fatal:', err)
  process.exit(1)
})
