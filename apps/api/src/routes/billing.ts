/**
 * Billing routes — admin-only via session auth, plus a webhook receiver and
 * a tick endpoint gated by the same INBOUND_SECRET the mail-engine uses.
 *
 * Wire-up: see app.ts mounting at /api/v1/billing.
 *
 * Auth contract:
 *   - Most routes: sessionAuth (admin V3). End-users never see these.
 *   - /webhooks/wistfare: header X-Wistfare-Secret matches WISTFARE_WEBHOOK_SECRET.
 *   - /internal/tick: header X-Inbound-Secret matches INBOUND_SECRET.
 *
 * IMPORTANT: the public-ish endpoints (webhooks, internal tick) are
 * registered BEFORE the sessionAuth-mounted sub-app so Hono dispatches
 * them without running session middleware. The sessionAuth sub-app uses a
 * wildcard `use('*')` and would otherwise intercept every path under this
 * mount.
 *
 * Idempotency stays in BillingService — see services/billing.ts.
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, sql } from 'drizzle-orm'
import {
  plans,
  planFeatures,
  orgMembers,
  emails,
  attachments,
  mailboxes,
  users,
  collectionAttempts,
} from '@wistmail/db'
import { ValidationError, NotFoundError, AuthenticationError } from '@wistmail/shared'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'
import { BillingService } from '../services/billing.js'
import { getWistfareClient } from '../lib/wistfare-client.js'

export const billingRoutes = new Hono<SessionEnv>()

// ── Webhook receiver (public, secret-gated) ───────────────────────────────
//
// Registered FIRST so it doesn't get caught by the session-auth sub-app
// mounted with `.use('*', sessionAuth)` further down.

billingRoutes.post('/webhooks/wistfare', async (c) => {
  const expected = process.env.WISTFARE_WEBHOOK_SECRET
  const got = c.req.header('X-Wistfare-Secret')
  if (expected && got !== expected) {
    throw new AuthenticationError('Invalid Wistfare webhook secret')
  }

  let payload: Record<string, any>
  try {
    payload = (await c.req.json()) as Record<string, any>
  } catch {
    throw new ValidationError('Webhook body is not JSON')
  }

  const event: string = String(payload.event ?? '')
  const transactionId: string | undefined = payload.transaction_id || payload.transactionId
  const referenceId: string | undefined = payload.reference_id || payload.referenceId

  const svc = new BillingService(getDb())
  const attempt = await svc.findCollectionAttempt({
    providerCollectionId: transactionId,
    idempotencyKey: referenceId,
  })

  if (!attempt) {
    return c.json({ ok: true, ignored: 'unknown attempt' }, 200)
  }

  if (event === 'collection.completed' || event === 'payment.completed') {
    await svc.markCollectionTerminal({
      attemptId: attempt.id,
      status: 'succeeded',
      providerCollectionId: transactionId,
      lastWebhookPayload: payload,
    })
    const credit = await svc.creditWallet({
      orgId: attempt.orgId,
      amountCents: attempt.amountCents,
      reason: 'topup',
      provider: 'wistfare_collections',
      providerRef: transactionId ?? attempt.idempotencyKey,
      initiatedBy: attempt.initiatedBy,
      metadata: {
        event,
        displayAmount: attempt.displayAmount,
        displayCurrency: attempt.displayCurrency,
      },
    })
    const sub = await svc.getActiveSubscription(attempt.orgId)
    if (sub && sub.status === 'suspended') {
      await svc.chargeRenewal(sub.id)
    }
    return c.json({ ok: true, credited: credit.amountCents, duplicate: !!credit.duplicate })
  }

  if (
    event === 'collection.failed' ||
    event === 'payment.failed' ||
    event === 'collection.expired'
  ) {
    const status = event.endsWith('expired') ? 'expired' : 'failed'
    await svc.markCollectionTerminal({
      attemptId: attempt.id,
      status: status as 'failed' | 'expired',
      failureReason: payload.failure_reason || payload.failureReason || `event=${event}`,
      providerCollectionId: transactionId,
      lastWebhookPayload: payload,
    })
    return c.json({ ok: true })
  }

  await svc.markCollectionTerminal({
    attemptId: attempt.id,
    status: attempt.status as 'failed' | 'succeeded' | 'expired',
    lastWebhookPayload: payload,
  })
  return c.json({ ok: true, ignored: 'unknown event' })
})

billingRoutes.post('/internal/tick', async (c) => {
  const expected = process.env.INBOUND_SECRET
  const got = c.req.header('X-Inbound-Secret')
  if (!expected || got !== expected) {
    throw new AuthenticationError('Invalid inbound secret')
  }
  const svc = new BillingService(getDb())
  const transitions = await svc.tickRenewals()
  return c.json({ data: { transitions } })
})

// ── Session-auth admin routes ─────────────────────────────────────────────

const sessionScopedAuth = new Hono<SessionEnv>()
sessionScopedAuth.use('*', sessionAuth)

async function resolveOrgId(c: import('hono').Context<SessionEnv>): Promise<string> {
  const orgId = c.get('orgId')
  if (orgId) return orgId
  const userId = c.get('userId')
  const r = await getDb()
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .limit(1)
  if (r.length === 0) {
    throw new NotFoundError('organization')
  }
  return r[0].orgId
}

sessionScopedAuth.get('/plans', async (c) => {
  const db = getDb()
  const allPlans = await db.select().from(plans).where(eq(plans.active, true))
  const allFeatures = await db.select().from(planFeatures)
  const featuresByPlan = new Map<string, typeof allFeatures>()
  for (const f of allFeatures) {
    const arr = featuresByPlan.get(f.planId) ?? []
    arr.push(f)
    featuresByPlan.set(f.planId, arr)
  }
  return c.json({
    data: allPlans
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        perSeatCents: p.perSeatCents,
        includedStorageMbPerSeat: p.includedStorageMbPerSeat,
        trialDays: p.trialDays,
        gracePeriodDays: p.gracePeriodDays,
        currency: p.currency,
        features: (featuresByPlan.get(p.id) ?? []).map((f) => ({
          key: f.key,
          value: f.value,
          label: f.label,
        })),
      })),
  })
})

sessionScopedAuth.get('/subscription', async (c) => {
  const orgId = await resolveOrgId(c)
  const svc = new BillingService(getDb())
  const sub = await svc.getActiveSubscription(orgId)
  if (!sub) return c.json({ data: null })
  const plan = await svc.getPlanById(sub.planId)
  return c.json({
    data: {
      ...sub,
      plan: plan
        ? {
            id: plan.id,
            code: plan.code,
            name: plan.name,
            perSeatCents: plan.perSeatCents,
            currency: plan.currency,
          }
        : null,
    },
  })
})

sessionScopedAuth.get('/wallet', async (c) => {
  const orgId = await resolveOrgId(c)
  const svc = new BillingService(getDb())
  const wallet = await svc.getOrCreateWallet(orgId)
  const recent = await svc.listTransactions({ orgId, limit: 20 })
  return c.json({ data: { ...wallet, recentTransactions: recent } })
})

sessionScopedAuth.get('/wallet/transactions', async (c) => {
  const orgId = await resolveOrgId(c)
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200)
  const offset = parseInt(c.req.query('offset') || '0', 10)
  const svc = new BillingService(getDb())
  const rows = await svc.listTransactions({ orgId, limit, offset })
  return c.json({ data: rows, limit, offset })
})

const subscribeSchema = z.object({
  planCode: z.string().min(1),
  seats: z.number().int().positive().optional(),
})
sessionScopedAuth.post('/subscribe', async (c) => {
  const body = await c.req.json()
  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }
  const orgId = await resolveOrgId(c)
  const userId = c.get('userId')
  const svc = new BillingService(getDb())
  const sub = await svc.startTrial({
    orgId,
    planCode: parsed.data.planCode,
    seats: parsed.data.seats,
    initiatedBy: userId,
  })
  return c.json({ data: sub }, 201)
})

const topupSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(['mtn_momo', 'airtel_money']),
  msisdn: z.string().regex(/^\d{9,15}$/, 'msisdn must be 9-15 digits'),
  displayAmount: z.number().positive().optional(),
  displayCurrency: z.string().length(3).optional(),
})
sessionScopedAuth.post('/topup', async (c) => {
  const body = await c.req.json()
  const parsed = topupSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }
  const orgId = await resolveOrgId(c)
  const userId = c.get('userId')
  const svc = new BillingService(getDb())

  const attempt = await svc.createCollectionAttempt({
    orgId,
    initiatedBy: userId,
    method: parsed.data.method,
    msisdn: parsed.data.msisdn,
    amountCents: parsed.data.amountCents,
    displayAmount: parsed.data.displayAmount,
    displayCurrency: parsed.data.displayCurrency,
  })

  const wf = getWistfareClient()
  const businessId = process.env.WISTFARE_BUSINESS_ID || 'biz_unset'
  const walletId = process.env.WISTFARE_WALLET_ID || 'wal_unset'
  const localCurrency = parsed.data.displayCurrency || 'RWF'
  const localAmount = parsed.data.displayAmount
    ? String(parsed.data.displayAmount)
    : String(parsed.data.amountCents)

  const resp = await wf.initiateCollection({
    businessId,
    walletId,
    customerPhone: parsed.data.msisdn,
    amount: localAmount,
    paymentMethod: parsed.data.method,
    currency: localCurrency,
    referenceId: attempt.idempotencyKey,
    description: `WistMail topup ${attempt.id}`,
  })

  await svc.setCollectionProviderId(attempt.id, resp.id)

  return c.json(
    {
      data: {
        id: attempt.id,
        status: attempt.status,
        providerCollectionId: resp.id,
        providerStatus: resp.status,
      },
    },
    201,
  )
})

sessionScopedAuth.get('/topup/:id', async (c) => {
  const id = c.req.param('id')
  const svc = new BillingService(getDb())
  const attempt = await svc.findCollectionAttempt({ idempotencyKey: id })
  if (!attempt) throw new NotFoundError('topup', id)
  return c.json({ data: attempt })
})

/**
 * Storage breakdown — best-effort, read-only. Aggregates byte usage across
 * the schema we have today:
 *   - mail        : sum(emails.size_bytes) where folder NOT IN (drafts, trash)
 *   - attachments : sum(attachments.size_bytes)
 *   - drafts      : sum(emails.size_bytes) where folder = 'drafts' OR is_draft
 *   - trash       : sum(emails.size_bytes) where folder = 'trash'
 *
 * Per-user list joins emails → mailboxes → users so admins can see who is
 * heaviest. We bucket sizes by mailbox.user_id rather than emails.from_address
 * because the mailbox owner is what gets billed.
 */
sessionScopedAuth.get('/storage-breakdown', async (c) => {
  const orgId = await resolveOrgId(c)
  const db = getDb()

  // Resolve org → user IDs → mailbox IDs once. This keeps every other
  // aggregation a single GROUP-BY against indexed columns rather than
  // join-everything-to-organizations.
  const memberRows = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId))
  const userIds = memberRows.map((r) => r.userId)
  if (userIds.length === 0) {
    return c.json({
      data: {
        totalBytes: 0,
        byCategory: { mail: 0, attachments: 0, drafts: 0, trash: 0 },
        byUser: [],
      },
    })
  }

  const mailboxRows = await db
    .select({ id: mailboxes.id, userId: mailboxes.userId })
    .from(mailboxes)
    .where(sql`${mailboxes.userId} IN ${userIds}`)
  const mailboxIds = mailboxRows.map((r) => r.id)
  const userByMailbox = new Map(mailboxRows.map((r) => [r.id, r.userId]))

  // Initialise the buckets so the response shape is stable when usage is 0.
  const byCategory = { mail: 0, attachments: 0, drafts: 0, trash: 0 }
  const byUserBytes = new Map<string, number>()

  if (mailboxIds.length > 0) {
    // Email size + folder bucketing — single scan, group by folder/draft flag.
    const emailRows = await db
      .select({
        mailboxId: emails.mailboxId,
        folder: emails.folder,
        isDraft: emails.isDraft,
        bytes: sql<number>`COALESCE(SUM(${emails.sizeBytes}), 0)`.as('bytes'),
      })
      .from(emails)
      .where(sql`${emails.mailboxId} IN ${mailboxIds}`)
      .groupBy(emails.mailboxId, emails.folder, emails.isDraft)

    for (const row of emailRows) {
      const bytes = Number(row.bytes ?? 0)
      const ownerId = userByMailbox.get(row.mailboxId)
      if (ownerId) {
        byUserBytes.set(ownerId, (byUserBytes.get(ownerId) ?? 0) + bytes)
      }
      if (row.folder === 'trash') {
        byCategory.trash += bytes
      } else if (row.folder === 'drafts' || row.isDraft) {
        byCategory.drafts += bytes
      } else {
        byCategory.mail += bytes
      }
    }

    // Attachment size — joins through emails for the mailbox filter; the
    // attachments table only knows email_id directly.
    const attachmentRows = await db
      .select({
        bytes: sql<number>`COALESCE(SUM(${attachments.sizeBytes}), 0)`.as('bytes'),
      })
      .from(attachments)
      .innerJoin(emails, eq(attachments.emailId, emails.id))
      .where(sql`${emails.mailboxId} IN ${mailboxIds}`)
    byCategory.attachments = Number(attachmentRows[0]?.bytes ?? 0)
  }

  // Resolve user names for the breakdown list.
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(sql`${users.id} IN ${userIds}`)
      : []
  const userById = new Map(userRows.map((u) => [u.id, u]))

  const byUser = Array.from(byUserBytes.entries())
    .map(([userId, bytes]) => ({
      userId,
      name: userById.get(userId)?.name ?? userById.get(userId)?.email ?? userId,
      bytes,
    }))
    .sort((a, b) => b.bytes - a.bytes)

  const totalBytes =
    byCategory.mail + byCategory.attachments + byCategory.drafts + byCategory.trash

  return c.json({
    data: { totalBytes, byCategory, byUser },
  })
})

/**
 * Payment methods — derive distinct (method, msisdn) pairs from the
 * collection_attempts ledger. No new schema; "saved methods" are simply
 * the ones the org has used at least once.
 */
sessionScopedAuth.get('/payment-methods', async (c) => {
  const orgId = await resolveOrgId(c)
  const db = getDb()

  // Ordered by most-recent so the list reads "what did I use last".
  const rows = await db
    .select({
      method: collectionAttempts.method,
      msisdn: collectionAttempts.msisdn,
      lastUsedAt: sql<Date>`MAX(${collectionAttempts.createdAt})`.as('last_used_at'),
      attempts: sql<number>`COUNT(*)::int`.as('attempts'),
    })
    .from(collectionAttempts)
    .where(eq(collectionAttempts.orgId, orgId))
    .groupBy(collectionAttempts.method, collectionAttempts.msisdn)
    .orderBy(desc(sql`MAX(${collectionAttempts.createdAt})`))

  return c.json({
    data: rows.map((r) => ({
      method: r.method,
      msisdn: r.msisdn,
      lastUsedAt: r.lastUsedAt,
      attempts: Number(r.attempts ?? 0),
    })),
  })
})

billingRoutes.route('/', sessionScopedAuth)
// `and` is imported above for future filters; current routes only need eq/sql.
void and
