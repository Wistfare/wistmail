import { createDb, type Database } from '@wistmail/db'

let db: Database | null = null

export function getDb(): Database {
  if (!db) {
    db = createDb()
  }
  return db
}

/// Test-only — swap in a drizzle Database backed by a different driver
/// (typically an in-process PGlite fixture). Subsequent getDb() calls
/// return the swapped instance until resetDb() is called. Used by
/// vitest setup to run integration tests without a real Postgres.
export function setDbForTests(override: Database): void {
  db = override
}

/// Test-only — drop the cached Database so the next getDb() falls
/// back to createDb(). Paired with setDbForTests so suites can roll
/// back their fixture at teardown.
export function resetDbForTests(): void {
  db = null
}
