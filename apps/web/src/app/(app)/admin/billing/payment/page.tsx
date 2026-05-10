'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Smartphone } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { EmptyState } from '@/components/ui'
import { PaymentMethodRow, type PaymentMethodKind } from '@/components/billing'
import { api } from '@/lib/api-client'

interface PaymentMethodsResponse {
  data: Array<{
    method: PaymentMethodKind
    msisdn: string
    lastUsedAt: string | null
    attempts: number
  }>
}

/**
 * `/admin/billing/payment` — Pencil reference: `Add payment method`
 * drawer (`o4uBd`).
 *
 * The Pencil shows a card-input drawer with MTN MoMo / Airtel Money pills
 * and a save CTA. Today the only "saved" method is one that's been used
 * for a top-up at least once (see GET /payment-methods). The "Add new"
 * affordance therefore links to /admin/billing/topup — that's where the
 * user provides the msisdn that becomes a saved method on success.
 */
export default function AdminBillingPaymentPage() {
  const [methods, setMethods] = useState<PaymentMethodsResponse['data']>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .get<PaymentMethodsResponse>('/api/v1/billing/payment-methods')
      .then((res) => {
        if (!cancelled) setMethods(res.data)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar
        scope="Admin / Billing"
        page="Payment methods"
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
              Add method
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
            Payment methods
          </h1>
          <p
            className="font-mono"
            style={{ fontSize: 12, color: '#6e6e6e' }}
          >
            Numbers we've used to top up the wallet. The first one is used by
            default for renewal collection retries.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          {loading ? (
            <p className="px-5 py-10 text-center font-mono text-[11px] text-wm-text-muted">
              Loading…
            </p>
          ) : methods.length === 0 ? (
            <EmptyState
              icon={<Smartphone className="h-8 w-8" />}
              title="No payment methods yet"
              description="Top up the wallet once and the number you used will show up here."
              action={
                <Link
                  href="/admin/billing/topup"
                  className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
                  style={{
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 18,
                    color: '#000000',
                  }}
                >
                  <Plus style={{ width: 13, height: 13 }} />
                  <span
                    className="font-mono font-bold uppercase"
                    style={{ fontSize: 11, letterSpacing: 1 }}
                  >
                    Top up to add
                  </span>
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {methods.map((m, i) => (
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

        <section className="border border-dashed border-wm-border bg-wm-surface px-6 py-6">
          <div className="flex items-start gap-4">
            <span className="flex h-9 w-9 items-center justify-center bg-wm-bg">
              <Plus className="h-4 w-4 text-wm-text-secondary" />
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="font-mono text-[13px] text-wm-text-primary">
                Add another mobile money number
              </h3>
              <p className="font-mono text-[11px] text-wm-text-tertiary">
                Pick MTN MoMo or Airtel Money on the next screen, enter the
                msisdn, and confirm a small top-up to save it.
              </p>
              <Link
                href="/admin/billing/topup"
                className="mt-2 inline-flex w-fit items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-accent hover:underline"
              >
                Add via top-up →
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
