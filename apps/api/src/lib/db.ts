import { createDb, type Database } from '@wistmail/db'

let db: Database | null = null

export function getDb(): Database {
  if (!db) {
    db = createDb()
  }
  return db
}
