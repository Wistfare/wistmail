/**
 * BillingService — single source of truth for wallet ledger and subscription
 * lifecycle mutations.
 *
 * Invariants this service enforces:
 *   - Every change to wallets.balanceCents has a matching wallet_transactions
 *     row written in the same transaction.
 *   - balanceAfterCents on each tx row equals the wallet's balance after the
 *     row was applied (monotonic, derivable from the ledger alone).
 *   - (provider, providerRef) inserts are idempotent — duplicate webhook
 *     deliveries return the existing row instead of double-crediting.
 *   - Frozen wallets reject every debit AND credit.
 *   - balanceCents is never allowed below zero unless the caller explicitly
 *     sets allowNegative (only billing internal renewal logic does this and
 *     even then we currently refuse — kept as an extension point).
 *
 * State machine for subscriptions (see schema/subscriptions.ts):
 *   trial → active → grace → suspended → cancelled
 *               ↑__________|
 *
 * Renewal logic intentionally lives in this service (not a worker) so it's
 * trivially testable and can be triggered by either a cron tick or a
 * post-topup webhook.
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import {
  collectionAttempts,
  plans,
  subscriptions,
  wallets,
  walletTransactions,
} from '@wistmail/db'
import type { Database } from '@wistmail/db'
import { ConflictError, NotFoundError, ValidationError, generateId } from '@wistmail/shared'

const DAY_MS = 24 * 60 * 60 * 1000

export type LedgerReason =
  | 'topup'
  | 'renewal_charge'
  | 'refund'
  | 'adjustment'
  | 'trial_credit'
  | 'chargeback'

export interface CreditInput {
  orgId: string
  amountCents: number
  reason: LedgerReason
  /** Provider name, e.g. 'wistfare_collections'. Pair with providerRef for idempotency. */
  provider?: string
  providerRef?: string
  subscriptionId?: string
  initiatedBy?: string
  note?: string
  metadata?: Record<string, unknown>
}

export interface DebitInput extends CreditInput {
  /** Allow the resulting balance to be < 0. Default false. */
  allowNegative?: boolean
}

export interface LedgerRow {
  id: string
  walletId: string
  orgId: string
  amountCents: number
  balanceAfterCents: number
  reason: string
  provider: string | null
  providerRef: string | null
  subscriptionId: string | null
  note: string | null
  createdAt: Date
  duplicate?: boolean
}

export interface TickResult {
  activated: number
  gracePeriod: number
  suspended: number
  charged: number
}

export class BillingService {
  constructor(private db: Database) {}

  // ── Wallet ────────────────────────────────────────────────────────────────

  async getOrCreateWallet(orgId: string) {
    const existing = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.orgId, orgId))
      .limit(1)
    if (existing.length > 0) return existing[0]
    const id = generateId('wal')
    await this.db.insert(wallets).values({ id, orgId, balanceCents: 0 })
    const created = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, id))
      .limit(1)
    return created[0]
  }

  async getWallet(orgId: string) {
    const r = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.orgId, orgId))
      .limit(1)
    return r[0] ?? null
  }

  /**
   * Credit the org wallet. Idempotent on (provider, providerRef).
   *
   * Returns the inserted (or pre-existing duplicate) ledger row. The caller
   * can detect a duplicate via `result.duplicate === true`.
   */
  async creditWallet(input: CreditInput): Promise<LedgerRow> {
    if (input.amountCents <= 0) {
      throw new ValidationError('amountCents must be > 0 for credit')
    }
    return this.applyLedgerEntry({ ...input, sign: 1 })
  }

  /** Debit the org wallet. Refuses negative balance unless allowNegative. */
  async debitWallet(input: DebitInput): Promise<LedgerRow> {
    if (input.amountCents <= 0) {
      throw new ValidationError('amountCents must be > 0 for debit')
    }
    return this.applyLedgerEntry({ ...input, sign: -1 })
  }

  private async applyLedgerEntry(
    input: CreditInput & { sign: 1 | -1; allowNegative?: boolean },
  ): Promise<LedgerRow> {
    // Idempotency check up-front. If the row already exists with the same
    // provider+ref, return it without touching the wallet again.
    if (input.provider && input.providerRef) {
      const dup = await this.db
        .select()
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.provider, input.provider),
            eq(walletTransactions.providerRef, input.providerRef),
          ),
        )
        .limit(1)
      if (dup.length > 0) {
        return { ...(dup[0] as LedgerRow), duplicate: true }
      }
    }

    const result = await this.db.transaction(async (tx) => {
      // Ensure wallet exists — fetch with FOR UPDATE semantics is unavailable
      // on PGlite, but our real Postgres path will benefit when we move off
      // PGlite for serving. For correctness here we rely on the partial
      // unique idempotency index + the single-writer assumption per org.
      const walletRows = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.orgId, input.orgId))
        .limit(1)
      let wallet = walletRows[0]
      if (!wallet) {
        const id = generateId('wal')
        await tx.insert(wallets).values({ id, orgId: input.orgId, balanceCents: 0 })
        const fresh = await tx.select().from(wallets).where(eq(wallets.id, id)).limit(1)
        wallet = fresh[0]
      }
      if (wallet.frozen) {
        throw new ConflictError('Wallet is frozen — admin lock active')
      }

      const delta = input.sign * input.amountCents
      const newBalance = wallet.balanceCents + delta
      if (newBalance < 0 && !input.allowNegative) {
        throw new ConflictError('Insufficient wallet balance')
      }

      const txId = generateId('wtx')
      await tx.insert(walletTransactions).values({
        id: txId,
        walletId: wallet.id,
        orgId: input.orgId,
        amountCents: delta,
        balanceAfterCents: newBalance,
        reason: input.reason,
        provider: input.provider ?? null,
        providerRef: input.providerRef ?? null,
        subscriptionId: input.subscriptionId ?? null,
        note: input.note ?? null,
        metadata: input.metadata ?? null,
        initiatedBy: input.initiatedBy ?? null,
      })

      await tx
        .update(wallets)
        .set({ balanceCents: newBalance, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id))

      const inserted = await tx
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, txId))
        .limit(1)
      return inserted[0] as LedgerRow
    })

    return result
  }

  async listTransactions(opts: { orgId: string; limit?: number; offset?: number }) {
    const limit = Math.min(opts.limit ?? 50, 200)
    const offset = opts.offset ?? 0
    return this.db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.orgId, opts.orgId))
      .orderBy(desc(walletTransactions.createdAt), desc(walletTransactions.id))
      .limit(limit)
      .offset(offset)
  }

  // ── Subscription ──────────────────────────────────────────────────────────

  async getActiveSubscription(orgId: string) {
    const r = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.orgId, orgId), sql`${subscriptions.status} <> 'cancelled'`),
      )
      .limit(1)
    return r[0] ?? null
  }

  async getPlanByCode(code: string) {
    const r = await this.db.select().from(plans).where(eq(plans.code, code)).limit(1)
    return r[0] ?? null
  }

  async getPlanById(id: string) {
    const r = await this.db.select().from(plans).where(eq(plans.id, id)).limit(1)
    return r[0] ?? null
  }

  async startTrial(input: {
    orgId: string
    planCode: string
    seats?: number
    initiatedBy?: string
    now?: Date
  }) {
    const existing = await this.getActiveSubscription(input.orgId)
    if (existing) {
      throw new ConflictError(`Org already has an active subscription (${existing.status})`)
    }
    const plan = await this.getPlanByCode(input.planCode)
    if (!plan) throw new NotFoundError('plan', input.planCode)

    const now = input.now ?? new Date()
    const trialEnds = new Date(now.getTime() + plan.trialDays * DAY_MS)
    const id = generateId('sub')

    await this.db.insert(subscriptions).values({
      id,
      orgId: input.orgId,
      planId: plan.id,
      status: 'trial',
      seats: input.seats ?? 1,
      trialStartedAt: now,
      trialEndsAt: trialEnds,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnds,
      createdAt: now,
      updatedAt: now,
    })

    // Audit-only zero ledger row so the trial is visible in the timeline.
    await this.db.insert(walletTransactions).values({
      id: generateId('wtx'),
      walletId: (await this.getOrCreateWallet(input.orgId)).id,
      orgId: input.orgId,
      amountCents: 0,
      balanceAfterCents: (await this.getWallet(input.orgId))!.balanceCents,
      reason: 'trial_credit',
      subscriptionId: id,
      initiatedBy: input.initiatedBy ?? null,
      note: `Trial started — ${plan.trialDays} days on ${plan.name}`,
    })

    const r = await this.db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1)
    return r[0]
  }

  /**
   * Try to charge the next renewal period. Idempotency-safe: callers may
   * invoke after grace/suspension. Returns details so the caller can
   * decide on subscription state transition.
   */
  async chargeRenewal(subscriptionId: string, now = new Date()): Promise<
    | { ok: true; transactionId: string; amountCents: number; periodEnd: Date }
    | { ok: false; reason: 'insufficient_funds' | 'cancelled' }
  > {
    const subRows = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1)
    const sub = subRows[0]
    if (!sub) throw new NotFoundError('subscription', subscriptionId)
    if (sub.status === 'cancelled') return { ok: false, reason: 'cancelled' }
    const plan = await this.getPlanById(sub.planId)
    if (!plan) throw new NotFoundError('plan', sub.planId)

    const amount = sub.seats * plan.perSeatCents
    const wallet = await this.getOrCreateWallet(sub.orgId)
    if (wallet.balanceCents < amount) return { ok: false, reason: 'insufficient_funds' }

    const tx = await this.debitWallet({
      orgId: sub.orgId,
      amountCents: amount,
      reason: 'renewal_charge',
      subscriptionId: sub.id,
    })

    // Period boundaries: anchor the new period to the previous end (or now,
    // for trial → active first charge). This avoids period drift if a tick
    // runs late.
    const prevEnd = sub.currentPeriodEnd ?? now
    const start = prevEnd > now ? now : prevEnd
    const end = new Date(start.getTime() + 30 * DAY_MS)

    await this.db
      .update(subscriptions)
      .set({
        status: 'active',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        graceEndsAt: null,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, sub.id))

    return { ok: true, transactionId: tx.id, amountCents: amount, periodEnd: end }
  }

  async tickRenewals(now = new Date()): Promise<TickResult> {
    const result: TickResult = { activated: 0, gracePeriod: 0, suspended: 0, charged: 0 }

    // Gather candidates we might transition. We keep this inside a single
    // pass — the renewal worker is idempotent so missing a row this tick
    // is fine, it'll be picked up next tick.
    const all = await this.db.select().from(subscriptions)
    for (const sub of all) {
      if (sub.status === 'cancelled') continue

      // Trial expiring → try to charge.
      if (sub.status === 'trial' && sub.trialEndsAt && sub.trialEndsAt <= now) {
        const r = await this.chargeRenewal(sub.id, now)
        if (r.ok) {
          result.activated += 1
          result.charged += 1
        } else {
          await this.transitionToGrace(sub.id, sub.trialEndsAt, now)
          result.gracePeriod += 1
        }
        continue
      }

      // Active period ending → renew.
      if (sub.status === 'active' && sub.currentPeriodEnd && sub.currentPeriodEnd <= now) {
        const r = await this.chargeRenewal(sub.id, now)
        if (r.ok) {
          result.charged += 1
        } else {
          await this.transitionToGrace(sub.id, sub.currentPeriodEnd, now)
          result.gracePeriod += 1
        }
        continue
      }

      // Grace ending → suspend.
      if (sub.status === 'grace' && sub.graceEndsAt && sub.graceEndsAt <= now) {
        await this.db
          .update(subscriptions)
          .set({ status: 'suspended', updatedAt: now })
          .where(eq(subscriptions.id, sub.id))
        result.suspended += 1
        continue
      }
    }

    return result
  }

  private async transitionToGrace(subId: string, periodEnd: Date, now: Date) {
    const subRows = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subId))
      .limit(1)
    const sub = subRows[0]
    const plan = await this.getPlanById(sub.planId)
    const graceEnds = new Date(periodEnd.getTime() + (plan?.gracePeriodDays ?? 7) * DAY_MS)
    await this.db
      .update(subscriptions)
      .set({ status: 'grace', graceEndsAt: graceEnds, updatedAt: now })
      .where(eq(subscriptions.id, subId))
  }

  // ── Collection attempts (Wistfare wiring) ─────────────────────────────────

  async createCollectionAttempt(input: {
    orgId: string
    initiatedBy: string
    method: 'mtn_momo' | 'airtel_money'
    msisdn: string
    amountCents: number
    displayAmount?: number
    displayCurrency?: string
    requestPayload?: Record<string, unknown>
  }) {
    const id = generateId('coa')
    const idempotencyKey = `wm-${id}`
    await this.db.insert(collectionAttempts).values({
      id,
      orgId: input.orgId,
      initiatedBy: input.initiatedBy,
      idempotencyKey,
      method: input.method,
      msisdn: input.msisdn,
      amountCents: input.amountCents,
      displayAmount: input.displayAmount ?? null,
      displayCurrency: input.displayCurrency ?? null,
      status: 'pending',
      requestPayload: input.requestPayload ?? null,
    })
    const r = await this.db
      .select()
      .from(collectionAttempts)
      .where(eq(collectionAttempts.id, id))
      .limit(1)
    return r[0]
  }

  async setCollectionProviderId(attemptId: string, providerCollectionId: string) {
    await this.db
      .update(collectionAttempts)
      .set({ providerCollectionId, updatedAt: new Date() })
      .where(eq(collectionAttempts.id, attemptId))
  }

  async findCollectionAttempt(opts: {
    providerCollectionId?: string
    idempotencyKey?: string
  }) {
    if (opts.providerCollectionId) {
      const r = await this.db
        .select()
        .from(collectionAttempts)
        .where(eq(collectionAttempts.providerCollectionId, opts.providerCollectionId))
        .limit(1)
      if (r.length > 0) return r[0]
    }
    if (opts.idempotencyKey) {
      const r = await this.db
        .select()
        .from(collectionAttempts)
        .where(eq(collectionAttempts.idempotencyKey, opts.idempotencyKey))
        .limit(1)
      return r[0] ?? null
    }
    return null
  }

  async markCollectionTerminal(input: {
    attemptId: string
    status: 'succeeded' | 'failed' | 'expired'
    failureReason?: string
    providerCollectionId?: string
    lastWebhookPayload?: Record<string, unknown>
  }) {
    await this.db
      .update(collectionAttempts)
      .set({
        status: input.status,
        failureReason: input.failureReason ?? null,
        providerCollectionId: input.providerCollectionId ?? undefined,
        lastWebhookPayload: input.lastWebhookPayload ?? undefined,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(collectionAttempts.id, input.attemptId))
  }
}
