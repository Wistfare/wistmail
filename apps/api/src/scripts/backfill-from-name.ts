/**
 * Backfill `emails.from_name` from each row's stored RFC-5322 `From`
 * header. Run once after deploying the from_name column. Idempotent —
 * only touches rows where from_name is NULL and the header has a
 * usable display name.
 *
 *   pnpm --filter @wistmail/api backfill-from-name
 *   BACKFILL_DRY_RUN=1 pnpm --filter @wistmail/api backfill-from-name
 *
 * Strategy: pure regex parse of the header value. Mailparser already
 * extracted these on inbound for new mail; for the legacy rows we
 * just need to recover the display name from the raw header we stored
 * in the `headers` jsonb column. Re-running mailparser would cost us
 * a full MIME re-parse per row — overkill for one column.
 */

import { isNull } from 'drizzle-orm'
import { emails, type Database } from '@wistmail/db'
import { sql } from 'drizzle-orm'
import { getDb, resetDbForTests as _resetDb } from '../lib/db.js'
void _resetDb

const BATCH = Number(process.env.BACKFILL_BATCH_SIZE ?? '500')
const DRY_RUN = process.env.BACKFILL_DRY_RUN === '1'

/// `From: "Sarah Kim" <sarah@x.com>`     → "Sarah Kim"
/// `From: Sarah Kim <sarah@x.com>`       → "Sarah Kim"
/// `From: <sarah@x.com>`                 → null (no name)
/// `From: sarah@x.com`                   → null (no name)
/// `From: "sarah@x.com" <sarah@x.com>`   → null (echoed address)
export function extractDisplayName(headerValue: string | undefined | null): string | null {
  if (!headerValue) return null
  const m = headerValue.match(/^\s*(?:"([^"]*)"|([^<]*?))\s*<([^>]+)>\s*$/)
  if (!m) return null
  const name = (m[1] ?? m[2] ?? '').trim()
  const addr = (m[3] ?? '').trim().toLowerCase()
  if (!name) return null
  if (name.toLowerCase() === addr) return null
  return name.slice(0, 255)
}

async function fetchPage(
  db: Database,
  beforeCreatedAt: Date,
): Promise<Array<{ id: string; createdAt: Date; fromHeader: string | null }>> {
  return db
    .select({
      id: emails.id,
      createdAt: emails.createdAt,
      // The `From` header is stored as a string in the headers jsonb.
      // Postgres ->> always returns text or null; cast to string in TS.
      fromHeader: sql<string | null>`coalesce(${emails.headers}->>'from', ${emails.headers}->>'From')`,
    })
    .from(emails)
    .where(
      sql`${isNull(emails.fromName)} AND ${emails.createdAt} < ${beforeCreatedAt.toISOString()}`,
    )
    .orderBy(sql`${emails.createdAt} DESC`)
    .limit(BATCH)
}

async function run(): Promise<void> {
  const db = getDb()

  // Initial bound: now+1s so the first page picks up the latest row.
  let cursor = new Date(Date.now() + 1000)
  let scanned = 0
  let updated = 0
  let skipped = 0

  while (true) {
    const rows = await fetchPage(db, cursor)
    if (rows.length === 0) break

    for (const row of rows) {
      scanned++
      const name = extractDisplayName(row.fromHeader)
      if (!name) {
        skipped++
        continue
      }
      if (DRY_RUN) {
        updated++
        continue
      }
      await db
        .update(emails)
        .set({ fromName: name })
        .where(sql`${emails.id} = ${row.id} AND ${isNull(emails.fromName)}`)
      updated++
    }
    cursor = rows[rows.length - 1]!.createdAt
    console.log(
      `[backfill-from-name] scanned=${scanned} updated=${updated} skipped=${skipped} cursor=${cursor.toISOString()}`,
    )
  }

  console.log(
    `[backfill-from-name] done — scanned=${scanned} updated=${updated} skipped=${skipped}${DRY_RUN ? ' (dry run)' : ''}`,
  )
}

// Only auto-run when invoked as a CLI (`tsx backfill-from-name.ts`).
// When vitest imports the file for the unit test on extractDisplayName,
// we must NOT spin up a Postgres connection — the test DB env doesn't
// exist and this would crash the test suite.
import { fileURLToPath } from 'node:url'
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  run()
    .catch((err) => {
      console.error('[backfill-from-name] failed', err)
      process.exit(1)
    })
    .then(() => process.exit(0))
}
