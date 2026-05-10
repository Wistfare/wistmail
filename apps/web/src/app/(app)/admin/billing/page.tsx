'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { StatCard } from '@/components/ui'
import {
  PaymentMethodRow,
  TransactionRow,
  WalletCard,
  type PaymentMethodKind,
} from '@/components/billing'
import { api } from '@/lib/api-client'
import { formatCents } from '@/lib/utils'

interface WalletResponse {
  data: {
    balanceCents: number
    currency: string
    recentTransactions: Array<{
      id: string
      amountCents: number
      balanceAfterCents: number
      reason: string
      note: string | null
      createdAt: string
    }>
  }
}

interface SubscriptionResponse {
  data: {
    status: string
    seats: number
    currentPeriodEnd: string | null
    plan: {
      code: string
      name: string
      perSeatCents: number
      currency: string
    } | null
  } | null
}

interface PaymentMethodsResponse {
  data: Array<{
    method: PaymentMethodKind
    msisdn: string
    lastUsedAt: string | null
    attempts: number
  }>
}

/**
 * `/admin/billing` — Pencil reference: `AdminV3-Plan-and-usage` (`FHgAk`).
 *
 * Top-of-funnel billing dashboard. Three reads:
 *   - wallet (balance + recent transactions)
 *   - subscription (current plan + period)
 *   - payment-methods (saved methods derived from collection_attempts)
 *
 * Anything that goes wrong on the read falls back to dashes — billing should
 * NEVER block the rest of the admin shell because of a transient API hiccup.
 */
export default function AdminBillingPage() {
  const [wallet, setWallet] = useState<WalletResponse['data'] | null>(null)
  const [sub, setSub] = useState<SubscriptionResponse['data']>(null)
  const [methods, setMethods] = useState<PaymentMethodsResponse['data']>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get<WalletResponse>('/api/v1/billing/wallet'),
      api.get<SubscriptionResponse>('/api/v1/billing/subscription'),
      api.get<PaymentMethodsResponse>('/api/v1/billing/payment-methods'),
    ]).then((res) => {
      if (cancelled) return
      const [w, s, m] = res
      if (w.status === 'fulfilled') setWallet(w.value.data)
      if (s.status === 'fulfilled') setSub(s.value.data)
      if (m.status === 'fulfilled') setMethods(m.value.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const renewalDate = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : '—'
  const renewalCents = sub?.plan
    ? sub.seats * sub.plan.perSeatCents
    : 0

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar
        scope="Admin"
        page="Billing"
        rightSlot={
          <Link
            href="/admin/billing/topup"
            className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
            style={{
              gap: 6,
              padding: '8px 14px',
              borderRadius: 18,
              boxShadow: '0 3px 14px 0 rgba(191,255,0,0.25)',
              color: '#000000',
            }}
          >
            <Plus style={{ width: 13, height: 13 }} />
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 11, letterSpacing: 1 }}
            >
              Top up
            </span>
          </Link>
        }
      />

      <div
        className="flex flex-col overflow-y-auto"
        style={{ gap: 24, padding: '28px 32px' }}
      >
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h1
            className="font-mono font-bold text-wm-text-primary"
            style={{ fontSize: 30 }}
          >
            Billing
          </h1>
          <p
            className="font-mono"
            style={{ fontSize: 12, color: '#6e6e6e' }}
          >
            Wallet balance, current plan, and recent activity.
          </p>
        </div>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="WALLET"
            value={loading ? '…' : formatCents(wallet?.balanceCents ?? 0)}
            change={loading ? '' : 'Available balance'}
            changeType="neutral"
          />
          <StatCard
            title="PLAN"
            value={loading ? '…' : sub?.plan?.name ?? 'No plan'}
            change={
              sub?.status
                ? sub.status.toUpperCase()
                : 'Choose a plan to start'
            }
            changeType={sub?.status === 'active' ? 'positive' : 'neutral'}
          />
          <StatCard
            title="NEXT RENEWAL"
            value={loading ? '…' : formatCents(renewalCents)}
            change={`On ${renewalDate}`}
            changeType="neutral"
          />
          <StatCard
            title="SEATS"
            value={loading ? '…' : sub?.seats?.toString() ?? '—'}
            change={
              sub?.plan
                ? `${formatCents(sub.plan.perSeatCents)} / seat`
                : 'Per-seat pricing'
            }
            changeType="neutral"
          />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <WalletCard
            balanceCents={wallet?.balanceCents ?? 0}
            autoRenew={sub?.status === 'active'}
          />
          <div className="flex flex-col border border-wm-border bg-wm-surface">
            <header className="flex items-baseline justify-between border-b border-wm-border px-5 py-4">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
                Recent activity
              </h2>
              <Link
                href="/admin/billing/invoices"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-wm-accent hover:underline"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            </header>
            {loading ? (
              <p className="px-5 py-6 font-mono text-[11px] text-wm-text-muted">
                Loading…
              </p>
            ) : (wallet?.recentTransactions ?? []).length === 0 ? (
              <p className="px-5 py-6 font-mono text-[11px] text-wm-text-muted">
                No transactions yet.
              </p>
            ) : (
              wallet!.recentTransactions
                .slice(0, 6)
                .map((row) => (
                  <TransactionRow
                    key={row.id}
                    amountCents={row.amountCents}
                    balanceAfterCents={row.balanceAfterCents}
                    reason={row.reason}
                    createdAt={row.createdAt}
                    note={row.note}
                  />
                ))
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <header className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
              Payment methods
            </h2>
            <Link
              href="/admin/billing/payment"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-wm-accent hover:underline"
            >
              Manage
              <ArrowRight className="h-3 w-3" />
            </Link>
          </header>
          {loading ? (
            <p className="px-5 py-6 font-mono text-[11px] text-wm-text-muted">
              Loading…
            </p>
          ) : methods.length === 0 ? (
            <p className="border border-dashed border-wm-border px-5 py-6 text-center font-mono text-[11px] text-wm-text-tertiary">
              No saved methods yet — top up once and we'll remember the number.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {methods.slice(0, 3).map((m, i) => (
                <PaymentMethodRow
                  key={`${m.method}:${m.msisdn}`}
                  method={m.method}
                  msisdn={m.msisdn}
                  lastUsedAt={m.lastUsedAt}
                  attempts={m.attempts}
                  isDefault={i === 0}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
