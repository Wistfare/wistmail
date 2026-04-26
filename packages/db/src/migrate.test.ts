/**
 * End-to-end tests for the migration runner against an in-memory
 * PGlite. The bug we just shipped — bootstrap blanket-marking
 * unapplied migrations as applied — was completely invisible to the
 * old test suite (the schema-shape tests don't actually run the
 * migrator). These exercises hit the three regression cases:
 *
 *  1. Greenfield DB: every migration runs, in order.
 *  2. Legacy ensureSchema DB: bootstrap path marks ONLY the snapshot
 *     migration, then runs 0001+ for real.
 *  3. Tracked DB with a buggy non-idempotent migration: refuses to
 *     bootstrap and surfaces the conflict.
 *
 * The fixtures live in `__fixtures__/` rather than referencing the
 * real `drizzle/` folder so the tests don't break every time someone
 * lands a new migration.
 */

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { runMigrations, type Migrator } from './migrate'

interface JournalEntry {
  idx: number
  version: '7'
  when: number
  tag: string
  breakpoints: boolean
}

async function buildFixture(
  files: Array<{ tag: string; sql: string; snapshotId: string; prevId: string }>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'migrate-test-'))
  await mkdir(join(root, 'meta'), { recursive: true })
  const journal: { version: '7'; dialect: 'postgresql'; entries: JournalEntry[] } = {
    version: '7',
    dialect: 'postgresql',
    entries: files.map((f, idx) => ({
      idx,
      version: '7',
      when: 1_700_000_000_000 + idx,
      tag: f.tag,
      breakpoints: true,
    })),
  }
  await writeFile(join(root, 'meta', '_journal.json'), JSON.stringify(journal, null, 2))
  for (const [idx, f] of files.entries()) {
    await writeFile(join(root, `${f.tag}.sql`), f.sql)
    await writeFile(
      join(root, 'meta', `${idx.toString().padStart(4, '0')}_snapshot.json`),
      JSON.stringify({
        id: f.snapshotId,
        prevId: f.prevId,
        version: '7',
        dialect: 'postgresql',
        tables: {},
        enums: {},
        schemas: {},
        sequences: {},
        _meta: { columns: {}, schemas: {}, tables: {} },
      }),
    )
  }
  return root
}

function adapt(pg: PGlite): Migrator {
  const db = drizzle(pg as unknown as Parameters<typeof drizzle>[0])
  return {
    migrate: (config) =>
      migrate(db, config as Parameters<typeof migrate>[1]) as unknown as Promise<void>,
    exec: async (sql) => {
      await pg.exec(sql)
    },
    trackerEmpty: async () => {
      try {
        const r = await pg.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"',
        )
        return (r.rows[0]?.n ?? 0) === 0
      } catch {
        return true
      }
    },
    recordApplied: async (hash, when) => {
      await pg.query('INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)', [
        hash,
        when,
      ])
    },
  }
}

let pg: PGlite | null = null
let folder: string | null = null

afterEach(async () => {
  if (pg) {
    await pg.close()
    pg = null
  }
  if (folder) {
    await rm(folder, { recursive: true, force: true })
    folder = null
  }
})

beforeEach(() => {
  pg = new PGlite()
})

const SILENT = { log: () => {}, warn: () => {}, error: () => {} }

describe('runMigrations', () => {
  it('greenfield: applies every migration in order', async () => {
    folder = await buildFixture([
      {
        tag: '0000_init',
        sql: 'CREATE TABLE users (id text PRIMARY KEY);',
        snapshotId: 'a1', prevId: '00000000-0000-0000-0000-000000000000',
      },
      {
        tag: '0001_emails',
        sql: 'CREATE TABLE emails (id text PRIMARY KEY);',
        snapshotId: 'a2', prevId: 'a1',
      },
      {
        tag: '0002_ai',
        sql: 'ALTER TABLE emails ADD COLUMN auto_summary text;',
        snapshotId: 'a3', prevId: 'a2',
      },
    ])

    await runMigrations(adapt(pg!), { migrationsFolder: folder, ...SILENT })

    const tables = await pg!.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
    )
    expect(tables.rows.map((r) => r.table_name)).toEqual(['emails', 'users'])

    const cols = await pg!.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='emails' AND column_name='auto_summary'`,
    )
    expect(cols.rows.length).toBe(1)
  })

  it('legacy ensureSchema DB: bootstrap marks ONLY the snapshot, then runs 0001+ for real', async () => {
    // Simulate ensureSchema having created the world.
    await pg!.exec('CREATE TABLE users (id text PRIMARY KEY);')

    folder = await buildFixture([
      {
        tag: '0000_init',
        sql: 'CREATE TABLE users (id text PRIMARY KEY);',
        snapshotId: 'a1', prevId: '00000000-0000-0000-0000-000000000000',
      },
      {
        tag: '0001_emails',
        sql: 'CREATE TABLE emails (id text PRIMARY KEY);',
        snapshotId: 'a2', prevId: 'a1',
      },
      {
        tag: '0002_ai',
        sql: 'ALTER TABLE emails ADD COLUMN auto_summary text;',
        snapshotId: 'a3', prevId: 'a2',
      },
    ])

    await runMigrations(adapt(pg!), { migrationsFolder: folder, ...SILENT })

    // The regression: 0001 + 0002 must have *actually run*, not been
    // silently marked as applied. The old bootstrap blanket-marked
    // them and the schema stayed at the legacy state.
    const cols = await pg!.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name='emails' AND column_name='auto_summary'`,
    )
    expect(cols.rows.length, 'auto_summary must exist — 0002 must actually run').toBe(1)

    // Tracker must contain all three.
    const tracked = await pg!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"`,
    )
    expect(tracked.rows[0]?.n).toBe(3)
  })

  it('tracked DB with a non-idempotent migration: refuses to bootstrap, surfaces the failure', async () => {
    // Pre-seed the tracker so we are in the "tracked DB" branch.
    await pg!.exec('CREATE SCHEMA "drizzle"')
    await pg!.exec(
      'CREATE TABLE "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)',
    )
    await pg!.exec(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ('preexisting', 1)`,
    )
    // Simulate a previously-run schema state: emails already exists.
    await pg!.exec('CREATE TABLE emails (id text PRIMARY KEY);')

    folder = await buildFixture([
      {
        tag: '0000_init',
        sql: 'CREATE TABLE users (id text PRIMARY KEY);',
        snapshotId: 'a1', prevId: '00000000-0000-0000-0000-000000000000',
      },
      {
        // Non-idempotent: collides with what's already there.
        // Would be silently swallowed under the old bootstrap.
        tag: '0001_collision',
        sql: 'CREATE TABLE emails (id text PRIMARY KEY);',
        snapshotId: 'a2', prevId: 'a1',
      },
    ])

    // The error message text varies by driver (PGlite wraps it as
    // "Failed query: …" without the underlying "already exists" text).
    // The behavioral assertion that matters is below: the tracker
    // must NOT grow — bootstrap was refused.
    await expect(
      runMigrations(adapt(pg!), { migrationsFolder: folder, ...SILENT }),
    ).rejects.toThrow()

    // Tracker must NOT have grown — we refused the bootstrap.
    const tracked = await pg!.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"`,
    )
    expect(tracked.rows[0]?.n).toBe(1)
  })
})
