import { Hono } from 'hono'
import { eq, and, desc, ilike, or, sql } from 'drizzle-orm'
import { NotFoundError, ValidationError } from '@wistmail/shared'
import {
  contacts,
  emails,
  mailboxes,
  orgMembers,
  users,
} from '@wistmail/db'
import { dualAuth, requireScope, type DualAuthEnv } from '../middleware/dual-auth.js'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { updateContactSchema } from '../lib/validation.js'
import { getDb } from '../lib/db.js'

/**
 * Mounted at /api/v1/contacts.
 *
 * - PATCH/DELETE /:id  → API-key or session, contacts:manage scope
 * - GET    /search     → session only (UI autocomplete)
 *
 * The `/search` endpoint mounts an inner router with sessionAuth so it
 * doesn't need the contacts:manage scope.
 */
export const contactRoutes = new Hono<DualAuthEnv>()

// Recipient autocomplete — UI-only, session-authenticated. Mounted
// FIRST so the dualAuth middleware below doesn't apply to it.
const searchRoutes = new Hono<SessionEnv>()
searchRoutes.use('*', sessionAuth)

interface SearchResult {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  source: 'org_member' | 'contact' | 'recent'
}

/**
 * GET /api/v1/contacts/search?q=ali&limit=8
 *
 * Three sources, merged + deduped by lowercased email, ordered by:
 *   1. Org members of the requester's org   (coworkers first)
 *   2. Recent recipients from sent emails    (frequency-ranked)
 *   3. Saved contacts                        (user's address book)
 *
 * Returns up to `limit` (default 8, max 20) results. Empty `q`
 * returns the most recent recipients (good default state for the
 * compose autocomplete dropdown).
 */
searchRoutes.get('/search', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const orgId = c.get('orgId')
  const rawQ = c.req.query('q') ?? ''
  const q = rawQ.trim().toLowerCase()
  const limit = Math.min(20, Math.max(1, parseInt(c.req.query('limit') ?? '8', 10) || 8))

  // Escape SQL LIKE wildcards so user input doesn't match more than
  // it should. We append a trailing `%` so prefix typing matches.
  const escaped = q.replace(/[%_\\]/g, (ch) => `\\${ch}`)
  const pattern = `${escaped}%`
  const looseMatch = `%${escaped}%`

  const results: SearchResult[] = []
  const seen = new Set<string>()

  function add(result: SearchResult) {
    const key = result.email.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    results.push(result)
  }

  // 1. Org members — name OR email prefix match. Excludes self.
  if (orgId) {
    const orgRows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(
        and(
          eq(orgMembers.orgId, orgId),
          sql`${users.id} <> ${userId}`,
          q.length === 0
            ? sql`true`
            : (or(
                ilike(users.name, looseMatch),
                ilike(users.email, pattern),
              ) ?? sql`true`),
        ),
      )
      .limit(limit)
    for (const m of orgRows) {
      add({
        id: m.id,
        email: m.email,
        name: m.name,
        avatarUrl: m.avatarUrl,
        source: 'org_member',
      })
      if (results.length >= limit) break
    }
  }

  // 2. Recent recipients from sent emails. We unnest to_addresses +
  // cc + bcc so single-recipient and group sends both contribute.
  if (results.length < limit) {
    const remaining = limit - results.length
    const recentRows = await db.execute<{ addr: string; lastSent: Date }>(sql`
      SELECT
        lower(addr) AS addr,
        max(${emails.createdAt}) AS "lastSent"
      FROM ${emails}
      INNER JOIN ${mailboxes} ON ${mailboxes.id} = ${emails.mailboxId}
      , LATERAL jsonb_array_elements_text(
        coalesce(${emails.toAddresses}, '[]'::jsonb)
        || coalesce(${emails.cc}, '[]'::jsonb)
        || coalesce(${emails.bcc}, '[]'::jsonb)
      ) AS addr
      WHERE ${mailboxes.userId} = ${userId}
        AND ${emails.folder} = 'sent'
        ${q.length === 0 ? sql`` : sql`AND lower(addr) LIKE ${looseMatch}`}
      GROUP BY lower(addr)
      ORDER BY "lastSent" DESC
      LIMIT ${remaining * 4}
    `)
    const recentArr = recentRows as unknown as Array<{ addr: string; lastSent: Date }>
    for (const r of recentArr) {
      add({
        id: `recent:${r.addr}`,
        email: r.addr,
        name: null,
        avatarUrl: null,
        source: 'recent',
      })
      if (results.length >= limit) break
    }
  }

  // 3. Saved contacts — fall back when org + recents don't fill the
  // requested limit.
  if (results.length < limit) {
    const remaining = limit - results.length
    const contactRows = await db
      .select({
        id: contacts.id,
        email: contacts.email,
        name: contacts.name,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, userId),
          q.length === 0
            ? sql`true`
            : (or(
                ilike(contacts.name, looseMatch),
                ilike(contacts.email, pattern),
              ) ?? sql`true`),
        ),
      )
      .orderBy(desc(contacts.updatedAt))
      .limit(remaining * 2)
    for (const c2 of contactRows) {
      add({
        id: c2.id,
        email: c2.email,
        name: c2.name,
        avatarUrl: null,
        source: 'contact',
      })
      if (results.length >= limit) break
    }
  }

  return c.json({ data: results })
})

contactRoutes.route('/', searchRoutes)
contactRoutes.use('*', dualAuth)

/**
 * PATCH /api/v1/contacts/:id
 */
contactRoutes.patch('/:id', requireScope('contacts:manage'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateContactSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const userId = c.get('userId')

  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .limit(1)

  if (existing.length === 0) throw new NotFoundError('Contact', id)

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata

  await db.update(contacts).set(updates).where(eq(contacts.id, id))

  const updated = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1)

  return c.json({
    id: updated[0].id,
    email: updated[0].email,
    name: updated[0].name,
    metadata: updated[0].metadata,
    updatedAt: updated[0].updatedAt,
  })
})

/**
 * DELETE /api/v1/contacts/:id
 */
contactRoutes.delete('/:id', requireScope('contacts:manage'), async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const userId = c.get('userId')

  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .limit(1)

  if (existing.length === 0) throw new NotFoundError('Contact', id)

  await db.delete(contacts).where(eq(contacts.id, id))
  return c.json({ ok: true })
})
