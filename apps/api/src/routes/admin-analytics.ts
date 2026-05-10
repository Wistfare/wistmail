/**
 * Admin analytics + overview-stats + admin-scoped domain list.
 *
 * Phase F endpoints surfaced by `/admin`, `/admin/analytics`, and
 * `/admin/domains`. Mounted under `/api/v1/admin/*` from `app.ts` —
 * lives in its own file so the existing `admin.ts` stays focused on
 * member CRUD + organization CRUD.
 *
 * All routes are session-auth gated and scoped to the caller's org.
 *
 * Aggregation strategy:
 *   - We bucket emails by `mailboxId` first (mailbox.userId resolves
 *     to the org owner via orgMembers) so every aggregation is a
 *     single GROUP BY against the indexed `emails_mailbox_folder_*`
 *     index. No multi-table joins on the hot path.
 *   - Range filters are clamped server-side to keep day buckets
 *     bounded. Default 7d for /overview-stats, 30d for /analytics.
 */

import { Hono } from 'hono'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import {
  attachments,
  domains,
  emails,
  mailboxes,
  orgMembers,
  organizations,
  sendingLogs,
  users,
} from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const adminAnalyticsRoutes = new Hono<SessionEnv>()

adminAnalyticsRoutes.use('*', sessionAuth)

// ── helpers ────────────────────────────────────────────────────────────────

async function resolveOrgId(c: import('hono').Context<SessionEnv>): Promise<string | null> {
  const orgId = c.get('orgId')
  if (orgId) return orgId
  const userId = c.get('userId')
  const r = await getDb()
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .limit(1)
  return r[0]?.orgId ?? null
}

/** Parse ?range=7d|30d|90d. Default fallback per route. */
function parseRangeDays(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const m = /^(\d{1,3})d$/.exec(raw)
  if (!m) return fallback
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  // Clamp at 365d so the day bucket stays bounded.
  return Math.min(n, 365)
}

/** YYYY-MM-DD in UTC — matches the SQL `date_trunc('day', ...)::date` text shape. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Build a continuous day-by-day series so the chart never has gaps —
 * sparse SQL grouping returns only days with rows; the UI needs zeros.
 */
function fillDailySeries(
  rows: Array<{ day: string; count: number }>,
  rangeDays: number,
): Array<{ date: string; count: number }> {
  const byDay = new Map(rows.map((r) => [r.day, r.count]))
  const out: Array<{ date: string; count: number }> = []
  const today = new Date()
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(today.getUTCDate() - i)
    const key = ymd(d)
    out.push({ date: key, count: byDay.get(key) ?? 0 })
  }
  return out
}

async function resolveOrgMailboxIds(orgId: string): Promise<{
  userIds: string[]
  mailboxIds: string[]
  userByMailbox: Map<string, string>
}> {
  const db = getDb()
  const memberRows = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId))
  const userIds = memberRows.map((r) => r.userId)
  if (userIds.length === 0) {
    return { userIds: [], mailboxIds: [], userByMailbox: new Map() }
  }
  const mailboxRows = await db
    .select({ id: mailboxes.id, userId: mailboxes.userId })
    .from(mailboxes)
    .where(sql`${mailboxes.userId} IN ${userIds}`)
  const mailboxIds = mailboxRows.map((r) => r.id)
  const userByMailbox = new Map(mailboxRows.map((r) => [r.id, r.userId]))
  return { userIds, mailboxIds, userByMailbox }
}

// ── GET /overview-stats ────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/overview-stats?range=7d
 *
 * Powers `/admin` (Pencil `boHfA`):
 *   - users               : member count
 *   - storageBytes        : sum(emails.size_bytes) + sum(attachments.size_bytes)
 *   - messagesSent        : sent-folder + status-sent count over the range
 *   - verifiedDomains     : domains.verified=true for org owner
 *   - totalDomains        : all org-owner domains
 *   - dailySent           : day-by-day sent counts for the bar chart
 *   - topSenders          : top 5 from_address by message count over the range,
 *                           joined to org users when the address resolves
 */
adminAnalyticsRoutes.get('/overview-stats', async (c) => {
  const orgId = await resolveOrgId(c)
  if (!orgId) {
    return c.json({
      data: {
        users: 0,
        storageBytes: 0,
        messagesSent: 0,
        verifiedDomains: 0,
        totalDomains: 0,
        dailySent: [],
        topSenders: [],
      },
    })
  }
  const rangeDays = parseRangeDays(c.req.query('range'), 7)
  const since = new Date(Date.now() - rangeDays * 86400_000)

  const db = getDb()
  const { userIds, mailboxIds } = await resolveOrgMailboxIds(orgId)

  // members count
  const usersCount = userIds.length

  // domains — by org owner (matches admin.ts /organization/domain pattern)
  const ownerRow = await db
    .select({ ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
  const ownerId = ownerRow[0]?.ownerId
  const allDomainRows = ownerId
    ? await db.select({ verified: domains.verified }).from(domains).where(eq(domains.userId, ownerId))
    : []
  const totalDomains = allDomainRows.length
  const verifiedDomains = allDomainRows.filter((d) => d.verified).length

  // storage — best effort, mirrors /billing/storage-breakdown shape
  let storageBytes = 0
  let messagesSent = 0
  let dailySent: Array<{ date: string; count: number }> = []
  let topSenders: Array<{ userId: string | null; name: string; count: number }> = []

  if (mailboxIds.length > 0) {
    const sizeRow = await db
      .select({ bytes: sql<number>`COALESCE(SUM(${emails.sizeBytes}), 0)`.as('bytes') })
      .from(emails)
      .where(sql`${emails.mailboxId} IN ${mailboxIds}`)
    const attachRow = await db
      .select({ bytes: sql<number>`COALESCE(SUM(${attachments.sizeBytes}), 0)`.as('bytes') })
      .from(attachments)
      .innerJoin(emails, eq(attachments.emailId, emails.id))
      .where(sql`${emails.mailboxId} IN ${mailboxIds}`)
    storageBytes = Number(sizeRow[0]?.bytes ?? 0) + Number(attachRow[0]?.bytes ?? 0)

    // messagesSent — outbound messages in the window. Anything in the
    // sent folder OR with a terminal sent status counts. We avoid
    // double-counting by checking folder='sent' (the engine moves
    // them on success).
    const sentRow = await db
      .select({ n: sql<number>`COALESCE(COUNT(*), 0)`.as('n') })
      .from(emails)
      .where(
        and(
          sql`${emails.mailboxId} IN ${mailboxIds}`,
          eq(emails.folder, 'sent'),
          gte(emails.createdAt, since),
        ),
      )
    messagesSent = Number(sentRow[0]?.n ?? 0)

    // daily sent series
    const dayRows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${emails.createdAt}), 'YYYY-MM-DD')`.as('day'),
        n: sql<number>`COUNT(*)`.as('n'),
      })
      .from(emails)
      .where(
        and(
          sql`${emails.mailboxId} IN ${mailboxIds}`,
          eq(emails.folder, 'sent'),
          gte(emails.createdAt, since),
        ),
      )
      .groupBy(sql`date_trunc('day', ${emails.createdAt})`)
    dailySent = fillDailySeries(
      dayRows.map((r) => ({ day: r.day, count: Number(r.n) })),
      rangeDays,
    )

    // top senders — group by from_address, top 5
    const senderRows = await db
      .select({
        from: emails.fromAddress,
        n: sql<number>`COUNT(*)`.as('n'),
      })
      .from(emails)
      .where(
        and(
          sql`${emails.mailboxId} IN ${mailboxIds}`,
          eq(emails.folder, 'sent'),
          gte(emails.createdAt, since),
        ),
      )
      .groupBy(emails.fromAddress)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5)

    if (senderRows.length > 0) {
      const senderEmails = senderRows.map((r) => r.from)
      const userRows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(sql`LOWER(${users.email}) IN ${senderEmails.map((e) => e.toLowerCase())}`)
      const userByEmail = new Map(userRows.map((u) => [u.email.toLowerCase(), u]))
      topSenders = senderRows.map((r) => {
        const u = userByEmail.get(r.from.toLowerCase())
        return {
          userId: u?.id ?? null,
          name: u?.name ?? r.from,
          count: Number(r.n),
        }
      })
    }
  } else {
    dailySent = fillDailySeries([], rangeDays)
  }

  return c.json({
    data: {
      users: usersCount,
      storageBytes,
      messagesSent,
      verifiedDomains,
      totalDomains,
      dailySent,
      topSenders,
    },
  })
})

// ── GET /analytics ─────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/analytics?range=30d
 *
 * Powers `/admin/analytics` (Pencil `m7EUl`).
 *
 * KPI strip is derived from `sending_logs` (the engine writes one row per
 * outbound delivery attempt; opened/clicked/bounced/delivered are
 * timestamps so a single GROUP BY produces all numerators).
 *
 * If no sending_logs exist in the window the page still renders — every
 * KPI is zero, every percentage is 0, and the bar chart shows the full
 * range with empty bars.
 */
adminAnalyticsRoutes.get('/analytics', async (c) => {
  const orgId = await resolveOrgId(c)
  if (!orgId) {
    const rangeDays = parseRangeDays(c.req.query('range'), 30)
    return c.json({
      data: {
        kpis: {
          sent: 0,
          delivered: 0,
          deliveredPct: 0,
          bounced: 0,
          bouncePct: 0,
          opened: 0,
          openPct: 0,
          clicked: 0,
          clickPct: 0,
          avgDeliverMs: 0,
        },
        dailySent: fillDailySeries([], rangeDays),
        topSenders: [],
        rangeDays,
      },
    })
  }
  const rangeDays = parseRangeDays(c.req.query('range'), 30)
  const since = new Date(Date.now() - rangeDays * 86400_000)

  const db = getDb()
  const { mailboxIds } = await resolveOrgMailboxIds(orgId)

  if (mailboxIds.length === 0) {
    return c.json({
      data: {
        kpis: {
          sent: 0,
          delivered: 0,
          deliveredPct: 0,
          bounced: 0,
          bouncePct: 0,
          opened: 0,
          openPct: 0,
          clicked: 0,
          clickPct: 0,
          avgDeliverMs: 0,
        },
        dailySent: fillDailySeries([], rangeDays),
        topSenders: [],
        rangeDays,
      },
    })
  }

  // KPIs from sending_logs joined to emails for mailbox scoping.
  // Each numerator is a count of non-null timestamps over a single scan.
  const kpiRow = await db
    .select({
      sent: sql<number>`COUNT(*)`.as('sent'),
      delivered: sql<number>`COUNT(${sendingLogs.deliveredAt})`.as('delivered'),
      bounced: sql<number>`COUNT(${sendingLogs.bouncedAt})`.as('bounced'),
      opened: sql<number>`COUNT(${sendingLogs.openedAt})`.as('opened'),
      clicked: sql<number>`COUNT(${sendingLogs.clickedAt})`.as('clicked'),
      avgDeliverMs: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${sendingLogs.deliveredAt} - ${sendingLogs.createdAt})) * 1000), 0)`.as(
        'avgDeliverMs',
      ),
    })
    .from(sendingLogs)
    .innerJoin(emails, eq(sendingLogs.emailId, emails.id))
    .where(
      and(
        sql`${emails.mailboxId} IN ${mailboxIds}`,
        gte(sendingLogs.createdAt, since),
      ),
    )

  const sent = Number(kpiRow[0]?.sent ?? 0)
  const delivered = Number(kpiRow[0]?.delivered ?? 0)
  const bounced = Number(kpiRow[0]?.bounced ?? 0)
  const opened = Number(kpiRow[0]?.opened ?? 0)
  const clicked = Number(kpiRow[0]?.clicked ?? 0)
  const avgDeliverMs = Math.round(Number(kpiRow[0]?.avgDeliverMs ?? 0))
  const pct = (n: number, d: number) => (d <= 0 ? 0 : Math.round((n / d) * 1000) / 10)

  // Daily sent — same query as /overview-stats but for the analytics window.
  const dayRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${emails.createdAt}), 'YYYY-MM-DD')`.as('day'),
      n: sql<number>`COUNT(*)`.as('n'),
    })
    .from(emails)
    .where(
      and(
        sql`${emails.mailboxId} IN ${mailboxIds}`,
        eq(emails.folder, 'sent'),
        gte(emails.createdAt, since),
      ),
    )
    .groupBy(sql`date_trunc('day', ${emails.createdAt})`)
  const dailySent = fillDailySeries(
    dayRows.map((r) => ({ day: r.day, count: Number(r.n) })),
    rangeDays,
  )

  // Top senders for analytics — same logic as overview-stats but a longer window.
  const senderRows = await db
    .select({
      from: emails.fromAddress,
      n: sql<number>`COUNT(*)`.as('n'),
    })
    .from(emails)
    .where(
      and(
        sql`${emails.mailboxId} IN ${mailboxIds}`,
        eq(emails.folder, 'sent'),
        gte(emails.createdAt, since),
      ),
    )
    .groupBy(emails.fromAddress)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10)

  let topSenders: Array<{ userId: string | null; name: string; count: number }> = []
  if (senderRows.length > 0) {
    const senderEmails = senderRows.map((r) => r.from)
    const userRows = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(sql`LOWER(${users.email}) IN ${senderEmails.map((e) => e.toLowerCase())}`)
    const userByEmail = new Map(userRows.map((u) => [u.email.toLowerCase(), u]))
    topSenders = senderRows.map((r) => {
      const u = userByEmail.get(r.from.toLowerCase())
      return {
        userId: u?.id ?? null,
        name: u?.name ?? r.from,
        count: Number(r.n),
      }
    })
  }

  return c.json({
    data: {
      kpis: {
        sent,
        delivered,
        deliveredPct: pct(delivered, sent),
        bounced,
        bouncePct: pct(bounced, sent),
        opened,
        openPct: pct(opened, sent),
        clicked,
        clickPct: pct(clicked, sent),
        avgDeliverMs,
      },
      dailySent,
      topSenders,
      rangeDays,
    },
  })
})

// ── GET /domains ───────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/domains
 *
 * Powers `/admin/domains` (Pencil `ZowPj`). Returns the same domain list
 * shape as `/setup/domains` but with usage stats joined:
 *   - messages30d  — count of emails sent from any address on this domain
 *                    in the last 30 days (always-on window so the page is
 *                    a useful health snapshot regardless of caller filter)
 *   - lastCheckedAt — domain.updatedAt (we re-check DNS on each settings
 *                     write; until we have a cron, updatedAt is the truth)
 */
adminAnalyticsRoutes.get('/domains', async (c) => {
  const orgId = await resolveOrgId(c)
  if (!orgId) {
    return c.json({ data: [] })
  }
  const db = getDb()

  const ownerRow = await db
    .select({ ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)
  const ownerId = ownerRow[0]?.ownerId
  if (!ownerId) {
    return c.json({ data: [] })
  }

  const domainRows = await db
    .select({
      id: domains.id,
      name: domains.name,
      verified: domains.verified,
      status: domains.status,
      mxVerified: domains.mxVerified,
      spfVerified: domains.spfVerified,
      dkimVerified: domains.dkimVerified,
      dmarcVerified: domains.dmarcVerified,
      createdAt: domains.createdAt,
      updatedAt: domains.updatedAt,
    })
    .from(domains)
    .where(eq(domains.userId, ownerId))

  if (domainRows.length === 0) {
    return c.json({ data: [] })
  }

  // Per-domain message count, last 30d, derived from the local-part-stripped
  // from_address. We compute via SUFFIX MATCH because `from_address` is
  // freeform and we don't store a foreign key.
  const since = new Date(Date.now() - 30 * 86400_000)
  const { mailboxIds } = await resolveOrgMailboxIds(orgId)
  const messageCountByDomain = new Map<string, number>()
  if (mailboxIds.length > 0) {
    const rows = await db
      .select({
        from: emails.fromAddress,
        n: sql<number>`COUNT(*)`.as('n'),
      })
      .from(emails)
      .where(
        and(
          sql`${emails.mailboxId} IN ${mailboxIds}`,
          eq(emails.folder, 'sent'),
          gte(emails.createdAt, since),
        ),
      )
      .groupBy(emails.fromAddress)
    for (const row of rows) {
      const at = row.from.indexOf('@')
      if (at === -1) continue
      const dom = row.from.slice(at + 1).toLowerCase()
      messageCountByDomain.set(dom, (messageCountByDomain.get(dom) ?? 0) + Number(row.n))
    }
  }

  const data = domainRows.map((d) => ({
    id: d.id,
    name: d.name,
    verified: d.verified,
    status: d.status,
    mxVerified: d.mxVerified,
    spfVerified: d.spfVerified,
    dkimVerified: d.dkimVerified,
    dmarcVerified: d.dmarcVerified,
    messages30d: messageCountByDomain.get(d.name.toLowerCase()) ?? 0,
    lastCheckedAt: d.updatedAt,
    createdAt: d.createdAt,
  }))

  return c.json({ data })
})
