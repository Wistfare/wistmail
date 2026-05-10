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
import { eq } from 'drizzle-orm'
import { plans, planFeatures, orgMembers } from '@wistmail/db'
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

billingRoutes.route('/', sessionScopedAuth)
