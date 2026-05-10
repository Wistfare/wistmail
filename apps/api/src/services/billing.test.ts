import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { organizations, users, wallets, walletTransactions, subscriptions } from '@wistmail/db'
import { seedSystemData } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import { getTestDb, resetTestDb } from '../test-support/pg-fixture.js'
import { BillingService } from './billing.js'

async function seedOrgAndUser(db: Awaited<ReturnType<typeof getTestDb>>) {
  const userId = generateId('u')
  const orgId = generateId('org')
  await db.insert(users).values({
    id: userId,
    email: `${userId}@test.example`,
    name: 'Test',
    passwordHash: 'x',
    setupComplete: true,
  })
  await db.insert(organizations).values({
    id: orgId,
    name: 'Acme',
    slug: `acme-${userId.slice(0, 6)}`,
    ownerId: userId,
  } as unknown as typeof organizations.$inferInsert)
  return { userId, orgId }
}

describe('BillingService', () => {
  beforeEach(async () => {
    await resetTestDb()
    const db = await getTestDb()
    await seedSystemData(db)
  })

  describe('wallet primitives', () => {
    it('creates a wallet on first credit and is idempotent on (provider, providerRef)', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId } = await seedOrgAndUser(db)

      const tx1 = await svc.creditWallet({
        orgId,
        amountCents: 1000,
        reason: 'topup',
        provider: 'wistfare_collections',
        providerRef: 'col_111',
      })
      expect(tx1.balanceAfterCents).toBe(1000)
      expect(tx1.duplicate).toBeUndefined()

      const tx2 = await svc.creditWallet({
        orgId,
        amountCents: 1000,
        reason: 'topup',
        provider: 'wistfare_collections',
        providerRef: 'col_111',
      })
      expect(tx2.duplicate).toBe(true)
      expect(tx2.id).toBe(tx1.id)

      const wallet = await svc.getWallet(orgId)
      expect(wallet?.balanceCents).toBe(1000) // not 2000 — duplicate ignored

      const ledgerRows = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.orgId, orgId))
      expect(ledgerRows).toHaveLength(1)
    })

    it('refuses debit when balance would go negative', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId } = await seedOrgAndUser(db)
      await svc.creditWallet({ orgId, amountCents: 100, reason: 'topup' })

      await expect(
        svc.debitWallet({ orgId, amountCents: 200, reason: 'renewal_charge' }),
      ).rejects.toThrow(/Insufficient/)
    })

    it('rejects ops on a frozen wallet', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId } = await seedOrgAndUser(db)
      const w = await svc.getOrCreateWallet(orgId)
      await db.update(wallets).set({ frozen: true }).where(eq(wallets.id, w.id))

      await expect(
        svc.creditWallet({ orgId, amountCents: 100, reason: 'topup' }),
      ).rejects.toThrow(/frozen/i)
    })

    it('balance-after equals running sum of ledger amounts', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId } = await seedOrgAndUser(db)
      await svc.creditWallet({ orgId, amountCents: 500, reason: 'topup' })
      await svc.creditWallet({ orgId, amountCents: 300, reason: 'topup' })
      await svc.debitWallet({ orgId, amountCents: 200, reason: 'renewal_charge' })

      const txs = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.orgId, orgId))
        .orderBy(walletTransactions.createdAt, walletTransactions.id)

      let running = 0
      for (const t of txs) {
        running += t.amountCents
        expect(t.balanceAfterCents).toBe(running)
      }
      expect(running).toBe(600)
      expect((await svc.getWallet(orgId))!.balanceCents).toBe(600)
    })
  })

  describe('subscription lifecycle', () => {
    it('startTrial creates a trial subscription', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId, userId } = await seedOrgAndUser(db)

      const sub = await svc.startTrial({ orgId, planCode: 'team', initiatedBy: userId })
      expect(sub.status).toBe('trial')
      expect(sub.trialEndsAt).toBeTruthy()

      // Idempotency-of-sorts: cannot double-start
      await expect(
        svc.startTrial({ orgId, planCode: 'team', initiatedBy: userId }),
      ).rejects.toThrow(/already has an active subscription/)
    })

    it('tickRenewals: trial expires → grace when wallet empty', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId } = await seedOrgAndUser(db)
      const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const sub = await svc.startTrial({ orgId, planCode: 'team', now: past })
      // Wallet is empty → renewal will fail → grace.
      const r = await svc.tickRenewals(new Date())
      expect(r.gracePeriod).toBe(1)

      const after = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, sub.id))
        .limit(1)
      expect(after[0].status).toBe('grace')
      expect(after[0].graceEndsAt).toBeTruthy()
    })

    it('tickRenewals: trial expires → active when wallet has funds', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId } = await seedOrgAndUser(db)
      const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const sub = await svc.startTrial({ orgId, planCode: 'team', now: past })
      await svc.creditWallet({ orgId, amountCents: 1000, reason: 'topup' })

      const r = await svc.tickRenewals(new Date())
      expect(r.activated).toBe(1)
      expect(r.charged).toBe(1)

      const after = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, sub.id))
        .limit(1)
      expect(after[0].status).toBe('active')
      expect((await svc.getWallet(orgId))!.balanceCents).toBe(700) // 1000 - 300
    })

    it('tickRenewals: grace → suspended when graceEndsAt passes', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId } = await seedOrgAndUser(db)
      const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      const sub = await svc.startTrial({ orgId, planCode: 'team', now: past })
      // First tick → grace (no funds)
      await svc.tickRenewals(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      // Then tick "now" — by which point grace should be exhausted
      const r = await svc.tickRenewals(new Date())
      expect(r.suspended).toBe(1)

      const after = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, sub.id))
        .limit(1)
      expect(after[0].status).toBe('suspended')
    })
  })

  describe('collection attempts', () => {
    it('creates and finds an attempt', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId, userId } = await seedOrgAndUser(db)

      const a = await svc.createCollectionAttempt({
        orgId,
        initiatedBy: userId,
        method: 'mtn_momo',
        msisdn: '250788000000',
        amountCents: 500,
      })
      expect(a.status).toBe('pending')
      expect(a.idempotencyKey).toBeTruthy()

      await svc.setCollectionProviderId(a.id, 'col_provider_1')
      const found = await svc.findCollectionAttempt({ providerCollectionId: 'col_provider_1' })
      expect(found?.id).toBe(a.id)

      const byKey = await svc.findCollectionAttempt({ idempotencyKey: a.idempotencyKey })
      expect(byKey?.id).toBe(a.id)
    })

    it('marks an attempt terminal', async () => {
      const db = await getTestDb()
      const svc = new BillingService(db)
      const { orgId, userId } = await seedOrgAndUser(db)
      const a = await svc.createCollectionAttempt({
        orgId,
        initiatedBy: userId,
        method: 'mtn_momo',
        msisdn: '250788000000',
        amountCents: 500,
      })
      await svc.markCollectionTerminal({
        attemptId: a.id,
        status: 'failed',
        failureReason: 'user did not confirm',
      })
      const found = await svc.findCollectionAttempt({ idempotencyKey: a.idempotencyKey })
      expect(found?.status).toBe('failed')
      expect(found?.failureReason).toBe('user did not confirm')
    })
  })
})
