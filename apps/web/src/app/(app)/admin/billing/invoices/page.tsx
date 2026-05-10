'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { Button, EmptyState, StatCard } from '@/components/ui'
import { api } from '@/lib/api-client'
import { formatCents, formatRelativeTime } from '@/lib/utils'

interface Transaction {
  id: string
  amountCents: number
  balanceAfterCents: number
  reason: string
  note: string | null
  provider: string | null
  providerRef: string | null
  createdAt: string
}

interface TxResponse {
  data: Transaction[]
  limit: number
  offset: number
}

interface SubResponse {
  data: {
    status: string
    seats: number
    currentPeriodEnd: string | null
    plan: { name: string; perSeatCents: number; currency: string } | null
  } | null
}

const reasonLabel: Record<string, string> = {
  topup: 'Top up',
  renewal_charge: 'Renewal',
  refund: 'Refund',
  adjustment: 'Adjustment',
  trial_credit: 'Trial credit',
  chargeback: 'Chargeback',
}

const PAGE_SIZE = 25

/**
 * `/admin/billing/invoices` — Pencil reference: `Invoices` page (`ryBKw`).
 *
 * Paginated wallet ledger rendered as an invoice-style table. We surface
 * top-of-page stats (paid, outstanding, next renewal, total) so admins can
 * scan year-to-date health before drilling into a row. Per-row download is
 * a placeholder until the PDF endpoint lands.
 */
export default function AdminBillingInvoicesPage() {
  const [txs, setTxs] = useState<Transaction[]>([])
  const [sub, setSub] = useState<SubResponse['data']>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get<TxResponse>(
        `/api/v1/billing/wallet/transactions?limit=${PAGE_SIZE}&offset=${offset}`,
      ),
      api.get<SubResponse>('/api/v1/billing/subscription'),
    ]).then((res) => {
      if (cancelled) return
      const [t, s] = res
      if (t.status === 'fulfilled') {
        setTxs(t.value.data)
        setHasMore(t.value.data.length === PAGE_SIZE)
      }
      if (s.status === 'fulfilled') setSub(s.value.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [offset])

  const totalPaidCents = txs
    .filter((t) => t.amountCents > 0 && t.reason === 'topup')
    .reduce((sum, t) => sum + t.amountCents, 0)
  const totalChargesCents = txs
    .filter((t) => t.amountCents < 0)
    .reduce((sum, t) => sum + Math.abs(t.amountCents), 0)
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
      <SettingsTopBar scope="Admin / Billing" page="Invoices" />
      <div
        className="flex flex-col overflow-y-auto"
        style={{ gap: 24, padding: '28px 32px' }}
      >
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h1
            className="font-mono font-bold text-wm-text-primary"
            style={{ fontSize: 30 }}
          >
            Invoices
          </h1>
          <p
            className="font-mono"
            style={{ fontSize: 12, color: '#6e6e6e' }}
          >
            Every charge, top-up, and adjustment on this workspace.
          </p>
        </div>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="TOTAL PAID"
            value={loading ? '…' : formatCents(totalPaidCents)}
            change="On this page"
            changeType="positive"
          />
          <StatCard
            title="OUTSTANDING"
            value="$0.00"
            change="Auto-deducted from wallet"
            changeType="neutral"
          />
          <StatCard
            title="NEXT RENEWAL"
            value={renewalDate}
            change={formatCents(renewalCents)}
            changeType="neutral"
          />
          <StatCard
            title="CHARGES"
            value={loading ? '…' : formatCents(totalChargesCents)}
            change="On this page"
            changeType="neutral"
          />
        </section>

        <section className="overflow-hidden border border-wm-border bg-wm-surface">
          <table className="w-full font-mono text-[12px]">
            <thead className="border-b border-wm-border bg-wm-bg/40 text-left">
              <tr className="text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Reference</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-right">Balance</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-wm-text-muted">
                    Loading…
                  </td>
                </tr>
              ) : txs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="No invoices yet"
                      description="Top up the wallet or start a plan to see entries here."
                    />
                  </td>
                </tr>
              ) : (
                txs.map((t) => {
                  const isCredit = t.amountCents > 0
                  const isZero = t.amountCents === 0
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-wm-border last:border-b-0 hover:bg-wm-surface-hover"
                    >
                      <td className="px-5 py-3 text-wm-text-secondary">
                        {formatRelativeTime(new Date(t.createdAt))}
                      </td>
                      <td className="px-5 py-3 text-wm-text-tertiary">
                        {t.providerRef ?? t.id.slice(0, 12)}
                      </td>
                      <td className="px-5 py-3 text-wm-text-secondary">
                        {reasonLabel[t.reason] ?? t.reason}
                        {t.note ? <span className="text-wm-text-tertiary"> — {t.note}</span> : null}
                      </td>
                      <td
                        className={`px-5 py-3 text-right tabular-nums ${
                          isCredit
                            ? 'text-wm-accent'
                            : isZero
                            ? 'text-wm-text-tertiary'
                            : 'text-wm-text-primary'
                        }`}
                      >
                        {isCredit ? '+' : isZero ? '' : '−'}
                        {formatCents(Math.abs(t.amountCents))}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-wm-text-tertiary">
                        {formatCents(t.balanceAfterCents)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary hover:text-wm-accent"
                          // PDF endpoint lands later — surface affordance now.
                          aria-label="Download receipt"
                          disabled
                          title="PDF download coming soon"
                        >
                          <Download className="h-3 w-3" />
                          PDF
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </section>

        {(offset > 0 || hasMore) && (
          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <span className="font-mono text-[11px] text-wm-text-tertiary">
              Showing {offset + 1}–{offset + txs.length}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasMore}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
