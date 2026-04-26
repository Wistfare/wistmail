/// Library version of the migration runner. The CLI wrapper
/// (migrate-runner.ts) just calls `runMigrations(...)` against a
/// real DB; tests call it against an in-memory PGlite. Splitting
/// this out is the only way the bootstrap logic is testable —
/// process.exit + module-level connection setup made the original
/// code untestable.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MigrationConfig } from 'drizzle-orm/migrator'

/// The minimum surface a migrator implementation needs. PGlite + the
/// production postgres-js path both adapt to this shape — see the two
/// adapter functions below the `runMigrations` definition.
export interface Migrator {
  /// Run drizzle's migrate() with the given config.
  migrate(config: MigrationConfig): Promise<void>
  /// Plain SQL execution. Used to bootstrap the drizzle tracker
  /// table on a legacy ensureSchema DB.
  exec(sql: string): Promise<void>
  /// Returns true iff the drizzle.__drizzle_migrations tracker is
  /// empty (or doesn't exist yet).
  trackerEmpty(): Promise<boolean>
  /// Inserts a hash row into the tracker. Used by the bootstrap path.
  recordApplied(hash: string, when: number): Promise<void>
}

export interface RunOptions {
  migrationsFolder: string
  /// Override "now" for deterministic tests.
  now?: () => number
  /// Logger override — defaults to console.{log,warn,error}.
  log?: (line: string) => void
  warn?: (line: string) => void
  error?: (line: string) => void
}

function describeError(err: unknown): { blob: string; codes: string[] } {
  const messages: string[] = []
  const codes: string[] = []
  let cursor: unknown = err
  const seen = new Set<unknown>()
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    if (cursor instanceof Error) {
      messages.push(cursor.message)
    } else {
      messages.push(String(cursor))
    }
    if (
      typeof cursor === 'object' &&
      cursor !== null &&
      'code' in cursor &&
      typeof (cursor as { code?: unknown }).code === 'string'
    ) {
      codes.push((cursor as { code: string }).code)
    }
    cursor = (cursor as { cause?: unknown }).cause
  }
  return { blob: messages.join(' → '), codes }
}

function isAlreadyAppliedSignal(err: unknown): boolean {
  const { blob, codes } = describeError(err)
  if (/already exists|duplicate/i.test(blob)) return true
  return codes.some(
    (c) => c === '42P07' || c === '42P06' || c === '42710' || c === '23505',
  )
}

/// Drives the migrator, with the bootstrap escape hatch for the
/// legacy ensureSchema → drizzle transition. The bootstrap path is
/// strictly limited:
///
/// 1. Only fires when the tracker is empty (truly first run).
/// 2. Only marks the snapshot migration (idx=0, the file that
///    mirrors ensureSchema) as applied.
/// 3. Re-runs the migrator so 0001+ run normally and
///    transactionally — failures there are real failures.
///
/// The previous implementation marked *every* journaled migration
/// as applied on the first "already exists" hit. That silently
/// no-op'd genuinely new migrations whose tables didn't yet exist,
/// causing data-loss-shaped bugs the moment a later migration in
/// the same run had a partial conflict.
export async function runMigrations(
  migrator: Migrator,
  options: RunOptions,
): Promise<void> {
  const log = options.log ?? ((line) => console.log(line))
  const warn = options.warn ?? ((line) => console.warn(line))
  const error = options.error ?? ((line) => console.error(line))
  const now = options.now ?? (() => Date.now())

  const trackerEmptyAtStart = await migrator.trackerEmpty()

  try {
    await migrator.migrate({ migrationsFolder: options.migrationsFolder })
    return
  } catch (err) {
    if (!isAlreadyAppliedSignal(err)) {
      const { blob } = describeError(err)
      error(`[migrate] migrator failed: ${blob}`)
      throw err
    }
    if (!trackerEmptyAtStart) {
      const { blob } = describeError(err)
      error(
        `[migrate] migrator hit "already exists" but tracker is non-empty — refusing to bootstrap, fix the migration: ${blob}`,
      )
      throw err
    }
    warn(
      '[migrate] empty tracker + existing schema → bootstrapping ONLY the snapshot migration',
    )
  }

  await migrator.exec('CREATE SCHEMA IF NOT EXISTS "drizzle"')
  await migrator.exec(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)

  type JournalEntry = { idx: number; tag: string; when: number }
  const journalRaw = await readFile(
    join(options.migrationsFolder, 'meta', '_journal.json'),
    'utf8',
  )
  const journal = JSON.parse(journalRaw) as { entries: JournalEntry[] }

  const snapshotEntry = journal.entries.find((e) => e.idx === 0)
  if (!snapshotEntry) {
    throw new Error('[migrate] journal has no idx=0 entry to bootstrap from')
  }

  const sqlPath = join(options.migrationsFolder, `${snapshotEntry.tag}.sql`)
  const content = await readFile(sqlPath, 'utf8')
  const hash = createHash('sha256').update(content).digest('hex')

  await migrator.recordApplied(hash, snapshotEntry.when ?? now())
  log(`[migrate] marked snapshot ${snapshotEntry.tag} (${hash.slice(0, 12)}) as applied`)

  // Forward path: run drizzle migrate again. Now that 0000 is in the
  // tracker, drizzle skips it and runs 0001+ in order. If a later
  // migration's DDL conflicts with what ensureSchema already created,
  // that migration must use IF NOT EXISTS / DO $$ guards — we will
  // not paper over it here.
  await migrator.migrate({ migrationsFolder: options.migrationsFolder })
}
