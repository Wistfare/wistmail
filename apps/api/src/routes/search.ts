import { Hono } from 'hono'
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import {
  attachments,
  contacts,
  emails,
  mailboxes,
  users,
} from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const searchRoutes = new Hono<SessionEnv>()
searchRoutes.use('*', sessionAuth)

/**
 * GET /api/v1/search?q=&filter=all|from|files|date&limit=
 *
 * MobileV3 global search aggregator for the Today-header search bar.
 * Returns four sections in one round trip:
 *   - topMatch: the single best hit (highest-ranked email)
 *   - messages: emails matching subject/from/body
 *   - people:   contacts + unique senders with a message count
 *   - files:    attachment rows whose filename matches
 *
 * The `filter` param narrows the result set when the user taps a chip:
 *   - 'from' restricts messages to rows whose from-address matches `q`
 *   - 'files' returns only the files section
 *   - 'date' is reserved (client-side for now, parsed into a range later)
 */
searchRoutes.get('/', async (c) => {
  const query = (c.req.query('q') || '').trim()
  const filter = (c.req.query('filter') || 'all').toLowerCase()
  const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 50)
  const userId = c.get('userId')

  if (query.length === 0) {
    return c.json({
      query,
      topMatch: null,
      messages: [],
      people: [],
      files: [],
    })
  }

  const db = getDb()

  // Resolve the user's mailbox set once — messages + files both need it,
  // and the empty case short-circuits every downstream query.
  const mailboxIds = (
    await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.userId, userId))
  ).map((m) => m.id)

  if (mailboxIds.length === 0) {
    return c.json({ query, topMatch: null, messages: [], people: [], files: [] })
  }

  // SQL LIKE pattern — escape %/_ so a stray wildcard in user input
  // doesn't turn into an accidental match-all scan.
  const pattern = `%${query.replace(/[%_]/g, (ch) => `\\${ch}`)}%`

  const wantsFilesOnly = filter === 'files'
  const wantsFromFilter = filter === 'from'

  const [messageRows, fileRows, contactRows] = await Promise.all([
    wantsFilesOnly
      ? Promise.resolve([])
      : db
          .select({
            id: emails.id,
            subject: emails.subject,
            fromAddress: emails.fromAddress,
            snippet: sql<string>`coalesce(substring(${emails.textBody}, 1, 240), '')`,
            isRead: emails.isRead,
            createdAt: emails.createdAt,
          })
          .from(emails)
          .where(
            and(
              inArray(emails.mailboxId, mailboxIds),
              wantsFromFilter
                ? ilike(emails.fromAddress, pattern)
                : or(
                    ilike(emails.subject, pattern),
                    ilike(emails.fromAddress, pattern),
                    ilike(emails.textBody, pattern),
                  ),
            ),
          )
          .orderBy(desc(emails.createdAt))
          .limit(limit),

    db
      .select({
        id: attachments.id,
        emailId: attachments.emailId,
        filename: attachments.filename,
        contentType: attachments.contentType,
        sizeBytes: attachments.sizeBytes,
        emailFrom: emails.fromAddress,
        emailCreatedAt: emails.createdAt,
      })
      .from(attachments)
      .innerJoin(emails, eq(emails.id, attachments.emailId))
      .where(
        and(
          inArray(emails.mailboxId, mailboxIds),
          ilike(attachments.filename, pattern),
        ),
      )
      .orderBy(desc(emails.createdAt))
      .limit(limit),

    wantsFilesOnly
      ? Promise.resolve([])
      : db
          .select({
            id: contacts.id,
            email: contacts.email,
            name: contacts.name,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.userId, userId),
              or(
                ilike(contacts.email, pattern),
                ilike(contacts.name, pattern),
              ),
            ),
          )
          .limit(limit),
  ])

  // People section: merge explicit contacts with distinct senders pulled
  // from the matched messages (so "Sarah" surfaces a person row even if
  // the user never saved her to contacts). Message count is rough —
  // counts the hits from this query, not historical total.
  const senderCounts = new Map<string, { name: string; count: number }>()
  for (const m of messageRows) {
    const name = extractDisplayName(m.fromAddress)
    const key = extractEmail(m.fromAddress).toLowerCase()
    if (!key) continue
    const existing = senderCounts.get(key)
    senderCounts.set(key, {
      name: existing?.name ?? name,
      count: (existing?.count ?? 0) + 1,
    })
  }

  const peopleMap = new Map<
    string,
    { id: string | null; name: string; email: string; messageCount: number }
  >()
  for (const [email, meta] of senderCounts.entries()) {
    peopleMap.set(email, {
      id: null,
      name: meta.name,
      email,
      messageCount: meta.count,
    })
  }
  for (const c of contactRows) {
    const key = c.email.toLowerCase()
    const current = peopleMap.get(key)
    peopleMap.set(key, {
      id: c.id,
      name: c.name ?? current?.name ?? extractDisplayName(c.email),
      email: c.email,
      messageCount: current?.messageCount ?? 0,
    })
  }

  const people = Array.from(peopleMap.values())
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, limit)

  // Top match: the first ranked email, annotated with a ranked `reason`
  // so the client can render the right preview. Null when no messages.
  const top = messageRows[0] ?? null
  const topMatch = top
    ? {
        kind: 'email' as const,
        id: top.id,
        subject: top.subject,
        fromName: extractDisplayName(top.fromAddress),
        fromAddress: top.fromAddress,
        snippet: top.snippet,
        createdAt: top.createdAt,
      }
    : null

  return c.json({
    query,
    topMatch,
    messages: messageRows.map((m) => ({
      id: m.id,
      subject: m.subject || '(no subject)',
      fromName: extractDisplayName(m.fromAddress),
      fromAddress: m.fromAddress,
      snippet: m.snippet,
      isRead: m.isRead,
      createdAt: m.createdAt,
    })),
    people,
    files: fileRows.map((f) => ({
      id: f.id,
      emailId: f.emailId,
      filename: f.filename,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      fromName: extractDisplayName(f.emailFrom),
      createdAt: f.emailCreatedAt,
    })),
  })
})

// Local copy of the display-name extractor used across unified-inbox too.
// Kept inline to avoid growing a shared utility module just for two routes.
function extractDisplayName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/)
  if (m) return m[1].trim()
  return from.split('@')[0] || from
}

function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/)
  if (m) return m[1].trim()
  return from.trim()
}

// Keep the users import referenced for future expansion (the People
// section should eventually surface internal team members as well).
void users
