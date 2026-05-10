import { beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
  organizations,
  orgMembers,
  sessions,
  subscriptions,
  users,
  walletTransactions,
} from '@wistmail/db'
import { seedSystemData } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import { app } from '../app.js'
import { getTestDb, resetTestDb } from '../test-support/pg-fixture.js'

/**
 * End-to-end billing route tests. Drive the real Hono app via app.fetch with
 * a session cookie minted directly into the sessions table. Wistfare client
 * runs in stub mode (no API key in test env), so /topup writes a real
 * collection_attempts row but doesn't talk to a network.
 */

async function seedAuthedOrg(db: Awaited<ReturnType<typeof getTestDb>>) {
  const userId = generateId('u')
  const orgId = generateId('org')
  const sessionId = generateId('ses')
  const token = randomBytes(32).toString('hex')

  await db.insert(users).values({
    id: userId,
    email: `${userId}@billing.test`,
    name: 'Owner',
    passwordHash: 'x',
    setupComplete: true,
  })
  await db.insert(organizations).values({
    id: orgId,
    name: 'Acme',
    slug: `acme-${userId.slice(0, 6)}`,
    ownerId: userId,
  } as unknown as typeof organizations.$inferInsert)
  await db.insert(orgMembers).values({
    id: generateId('mem'),
    orgId,
    userId,
    role: 'owner',
  })
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })

  return { userId, orgId, cookie: `wm_session=${token}` }
}

describe('billing routes', () => {
  beforeEach(async () => {
    await resetTestDb()
    const db = await getTestDb()
    await seedSystemData(db)
  })

  it('GET /plans returns the seeded Team plan with features', async () => {
    const db = await getTestDb()
    const { cookie } = await seedAuthedOrg(db)
    const res = await app.fetch(
      new Request('http://localhost/api/v1/billing/plans', {
        headers: { Cookie: cookie },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: any[] }
    expect(body.data.length).toBeGreaterThan(0)
    const team = body.data.find((p) => p.code === 'team')
    expect(team).toBeTruthy()
    expect(team.perSeatCents).toBe(300)
    expect(team.features.length).toBeGreaterThan(0)
  })

  it('POST /subscribe + GET /subscription happy path', async () => {
    const db = await getTestDb()
    const { cookie } = await seedAuthedOrg(db)

    const subRes = await app.fetch(
      new Request('http://localhost/api/v1/billing/subscribe', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: 'team' }),
      }),
    )
    expect(subRes.status).toBe(201)

    const getRes = await app.fetch(
      new Request('http://localhost/api/v1/billing/subscription', {
        headers: { Cookie: cookie },
      }),
    )
    const body = (await getRes.json()) as { data: any }
    expect(body.data.status).toBe('trial')
    expect(body.data.plan.code).toBe('team')
  })

  it('POST /topup creates an attempt and returns provider id (stubbed)', async () => {
    const db = await getTestDb()
    const { cookie } = await seedAuthedOrg(db)

    const res = await app.fetch(
      new Request('http://localhost/api/v1/billing/topup', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: 600,
          method: 'mtn_momo',
          msisdn: '250788000000',
          displayAmount: 7500,
          displayCurrency: 'RWF',
        }),
      }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { data: any }
    expect(body.data.status).toBe('pending')
    expect(body.data.providerCollectionId).toContain('col_stub_')
  })

  it('webhook credits wallet on collection.completed and is idempotent', async () => {
    const db = await getTestDb()
    const { cookie } = await seedAuthedOrg(db)

    const topup = (await (
      await app.fetch(
        new Request('http://localhost/api/v1/billing/topup', {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountCents: 600,
            method: 'mtn_momo',
            msisdn: '250788000000',
          }),
        }),
      )
    ).json()) as { data: any }

    // First webhook → credit
    const r1 = await app.fetch(
      new Request('http://localhost/api/v1/billing/webhooks/wistfare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'collection.completed',
          transaction_id: topup.data.providerCollectionId,
          status: 'completed',
          amount: '7500',
          currency: 'RWF',
        }),
      }),
    )
    expect(r1.status).toBe(200)
    const j1 = (await r1.json()) as { credited: number; duplicate: boolean }
    expect(j1.credited).toBe(600)
    expect(j1.duplicate).toBe(false)

    // Second delivery of same webhook → must be a no-op
    const r2 = await app.fetch(
      new Request('http://localhost/api/v1/billing/webhooks/wistfare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'collection.completed',
          transaction_id: topup.data.providerCollectionId,
          status: 'completed',
          amount: '7500',
          currency: 'RWF',
        }),
      }),
    )
    expect(r2.status).toBe(200)
    const j2 = (await r2.json()) as { duplicate: boolean }
    expect(j2.duplicate).toBe(true)

    // Wallet endpoint should reflect a single 600c credit.
    const w = (await (
      await app.fetch(
        new Request('http://localhost/api/v1/billing/wallet', {
          headers: { Cookie: cookie },
        }),
      )
    ).json()) as { data: any }
    expect(w.data.balanceCents).toBe(600)
  })

  it('webhook with payment.failed marks attempt failed without crediting', async () => {
    const db = await getTestDb()
    const { cookie } = await seedAuthedOrg(db)

    const topup = (await (
      await app.fetch(
        new Request('http://localhost/api/v1/billing/topup', {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountCents: 1000,
            method: 'mtn_momo',
            msisdn: '250788000000',
          }),
        }),
      )
    ).json()) as { data: any }

    const r = await app.fetch(
      new Request('http://localhost/api/v1/billing/webhooks/wistfare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment.failed',
          transaction_id: topup.data.providerCollectionId,
          status: 'failed',
          failure_reason: 'user did not confirm',
        }),
      }),
    )
    expect(r.status).toBe(200)
    const w = (await (
      await app.fetch(
        new Request('http://localhost/api/v1/billing/wallet', {
          headers: { Cookie: cookie },
        }),
      )
    ).json()) as { data: any }
    expect(w.data.balanceCents).toBe(0)
  })

  it('webhook respects WISTFARE_WEBHOOK_SECRET when set', async () => {
    process.env.WISTFARE_WEBHOOK_SECRET = 'top-secret'
    try {
      const r = await app.fetch(
        new Request('http://localhost/api/v1/billing/webhooks/wistfare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'collection.completed' }),
        }),
      )
      expect(r.status).toBe(401)
    } finally {
      delete process.env.WISTFARE_WEBHOOK_SECRET
    }
  })

  it('internal/tick rejects without secret and accepts with one', async () => {
    const r = await app.fetch(
      new Request('http://localhost/api/v1/billing/internal/tick', { method: 'POST' }),
    )
    expect(r.status).toBe(401)

    process.env.INBOUND_SECRET = 'inb'
    try {
      const r2 = await app.fetch(
        new Request('http://localhost/api/v1/billing/internal/tick', {
          method: 'POST',
          headers: { 'X-Inbound-Secret': 'inb' },
        }),
      )
      expect(r2.status).toBe(200)
      const body = (await r2.json()) as { data: { transitions: any } }
      expect(body.data.transitions).toBeDefined()
    } finally {
      delete process.env.INBOUND_SECRET
    }
  })

  it('full e2e: subscribe → topup → webhook credit → tick → renewal charge', async () => {
    const db = await getTestDb()
    const { cookie, orgId } = await seedAuthedOrg(db)

    // 1. Subscribe (trial)
    await app.fetch(
      new Request('http://localhost/api/v1/billing/subscribe', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: 'team' }),
      }),
    )

    // 2. Topup 600c
    const topup = (await (
      await app.fetch(
        new Request('http://localhost/api/v1/billing/topup', {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountCents: 600,
            method: 'mtn_momo',
            msisdn: '250788000000',
          }),
        }),
      )
    ).json()) as { data: any }

    // 3. Webhook completes the topup
    await app.fetch(
      new Request('http://localhost/api/v1/billing/webhooks/wistfare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'collection.completed',
          transaction_id: topup.data.providerCollectionId,
        }),
      }),
    )

    // 4. Force trial expiry by warping trialEndsAt to the past, then tick.
    await db
      .update(subscriptions)
      .set({
        trialEndsAt: new Date(Date.now() - 1000),
        currentPeriodEnd: new Date(Date.now() - 1000),
      })
      .where(eq(subscriptions.orgId, orgId))

    process.env.INBOUND_SECRET = 'inb'
    try {
      const tickRes = await app.fetch(
        new Request('http://localhost/api/v1/billing/internal/tick', {
          method: 'POST',
          headers: { 'X-Inbound-Secret': 'inb' },
        }),
      )
      const body = (await tickRes.json()) as { data: { transitions: any } }
      expect(body.data.transitions.activated).toBe(1)
      expect(body.data.transitions.charged).toBe(1)
    } finally {
      delete process.env.INBOUND_SECRET
    }

    // 5. Verify final state: sub active, balance 300c, ledger has trial+topup+renewal.
    const subBody = (await (
      await app.fetch(
        new Request('http://localhost/api/v1/billing/subscription', {
          headers: { Cookie: cookie },
        }),
      )
    ).json()) as { data: any }
    expect(subBody.data.status).toBe('active')

    const walletBody = (await (
      await app.fetch(
        new Request('http://localhost/api/v1/billing/wallet', {
          headers: { Cookie: cookie },
        }),
      )
    ).json()) as { data: any }
    expect(walletBody.data.balanceCents).toBe(300)

    const ledger = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.orgId, orgId))
    const reasons = ledger.map((r) => r.reason).sort()
    expect(reasons).toContain('trial_credit')
    expect(reasons).toContain('topup')
    expect(reasons).toContain('renewal_charge')
  })
})
