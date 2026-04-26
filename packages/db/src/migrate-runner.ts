/// CLI wrapper around `runMigrations`. Invoked from the deploy
/// pipeline inside a one-shot `docker compose run --rm api`
/// container, before the real api service restarts. Idempotent.
///
/// All bootstrap / safety logic lives in ./migrate.ts so that
/// PGlite-backed unit tests can exercise it without spinning up
/// real Postgres or shelling out to the CLI.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { runMigrations, type Migrator } from './migrate.js'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('[migrate] DATABASE_URL not set — refusing to run')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = join(here, '..', 'drizzle')

const client = postgres(url, { max: 1 })
const db = drizzle(client)

const migrator: Migrator = {
  migrate: (config) => migrate(db, config),
  exec: async (sql) => {
    // postgres-js: `client.unsafe(sql)` runs raw SQL — required for
    // CREATE SCHEMA / CREATE TABLE that don't fit the tagged-template
    // shape cleanly.
    await client.unsafe(sql)
  },
  trackerEmpty: async () => {
    try {
      const rows = await client`
        SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"
      `
      return ((rows[0] as { n?: number } | undefined)?.n ?? 0) === 0
    } catch {
      // Schema/table missing → tracker is empty by definition.
      return true
    }
  },
  recordApplied: async (hash, when) => {
    await client`
      INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
      VALUES (${hash}, ${when})
    `
  },
}

try {
  await runMigrations(migrator, { migrationsFolder })
  console.log('[migrate] ok')
  await client.end()
  process.exit(0)
} catch (err) {
  // runMigrations already logs the structured detail; re-emit a
  // short trailer so it's easy to spot in deploy logs.
  console.error('[migrate] failed')
  await client.end().catch(() => {})
  process.exit(1)
}
