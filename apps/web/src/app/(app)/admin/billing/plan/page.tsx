'use client'

import { useEffect, useState } from 'react'
import { SettingsTopBar } from '@/components/shell'
import { PlanCard, type PlanCardFeature } from '@/components/billing'
import { api } from '@/lib/api-client'
import { formatCents } from '@/lib/utils'

interface PlansResponse {
  data: Array<{
    id: string
    code: string
    name: string
    description: string | null
    perSeatCents: number
    includedStorageMbPerSeat: number
    trialDays: number
    currency: string
    features: PlanCardFeature[]
  }>
}

interface SubscriptionResponse {
  data: {
    status: string
    seats: number
    currentPeriodEnd: string | null
    plan: { code: string; name: string; perSeatCents: number; currency: string } | null
  } | null
}

const STATIC_TIERS: Record<
  string,
  { description: string; recommended?: boolean }
> = {
  free: { description: 'For evaluating WistMail.' },
  team: {
    description: '$3 / user / month — everything most workspaces need.',
    recommended: true,
  },
  business: {
    description: 'Adds advanced controls and dedicated support.',
  },
  enterprise: {
    description: 'Custom seats, dedicated infra, and priority response.',
  },
}

/**
 * `/admin/billing/plan` — Pencil reference: `AdminV3-Plan` (`iz5TA`).
 *
 * Plan picker. Today the API returns the seeded "team" plan; the other
 * tiers are rendered as static cards so the picker still scans like the
 * Pencil even before more rows land in the catalog.
 */
export default function AdminBillingPlanPage() {
  const [plans, setPlans] = useState<PlansResponse['data']>([])
  const [sub, setSub] = useState<SubscriptionResponse['data']>(null)
  const [loading, setLoading] = useState(true)
  const [subscribingCode, setSubscribingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get<PlansResponse>('/api/v1/billing/plans'),
      api.get<SubscriptionResponse>('/api/v1/billing/subscription'),
    ]).then((res) => {
      if (cancelled) return
      const [p, s] = res
      if (p.status === 'fulfilled') setPlans(p.value.data)
      if (s.status === 'fulfilled') setSub(s.value.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const subscribe = async (planCode: string) => {
    setSubscribingCode(planCode)
    setError(null)
    try {
      await api.post('/api/v1/billing/subscribe', { planCode })
      const fresh = await api.get<SubscriptionResponse>(
        '/api/v1/billing/subscription',
      )
      setSub(fresh.data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start plan'
      setError(msg)
    } finally {
      setSubscribingCode(null)
    }
  }

  // The picker shows: Free (synthetic), each catalog plan, then synthetic
  // Business + Enterprise placeholders if they're not in the catalog yet.
  const planByCode = new Map(plans.map((p) => [p.code, p]))
  const lineup = ['free', 'team', 'business', 'enterprise']

  const currentCode = sub?.plan?.code ?? null

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar scope="Admin / Billing" page="Plan" />
      <div
        className="flex flex-col overflow-y-auto"
        style={{ gap: 28, padding: '28px 32px' }}
      >
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h1
            className="font-mono font-bold text-wm-text-primary"
            style={{ fontSize: 30 }}
          >
            Choose the plan that fits your team
          </h1>
          <p
            className="font-mono"
            style={{ fontSize: 12, color: '#6e6e6e' }}
          >
            You can switch tiers any time — billed pro-rated on the next renewal.
          </p>
        </div>

        {error && (
          <div className="border border-wm-error px-4 py-3 font-mono text-[12px] text-wm-error">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {lineup.map((code) => {
            const plan = planByCode.get(code)
            const meta = STATIC_TIERS[code]
            const isCurrent = currentCode === code
            if (plan) {
              return (
                <PlanCard
                  key={code}
                  code={plan.code}
                  name={plan.name}
                  description={plan.description ?? meta?.description ?? null}
                  perSeatCents={plan.perSeatCents}
                  currency={plan.currency}
                  features={plan.features}
                  current={isCurrent}
                  recommended={meta?.recommended && !isCurrent}
                  ctaLabel={
                    isCurrent
                      ? 'Current plan'
                      : subscribingCode === plan.code
                      ? 'Starting…'
                      : `Choose ${plan.name}`
                  }
                  ctaDisabled={isCurrent || subscribingCode !== null}
                  onCtaClick={() => void subscribe(plan.code)}
                />
              )
            }
            // Catalog row not present yet — render a placeholder card so the
            // tier still appears in the picker.
            const isFree = code === 'free'
            const isEnterprise = code === 'enterprise'
            return (
              <PlanCard
                key={code}
                code={code}
                name={code === 'business' ? 'Business' : code === 'enterprise' ? 'Enterprise' : 'Free'}
                description={meta?.description ?? null}
                perSeatCents={isFree ? 0 : isEnterprise ? 0 : 800}
                features={
                  isFree
                    ? [
                        { key: 'one-mailbox', label: '1 mailbox' },
                        { key: 'no-storage', label: '1 GB storage' },
                      ]
                    : isEnterprise
                    ? [
                        { key: 'custom-seats', label: 'Custom seats' },
                        { key: 'dedicated', label: 'Dedicated support' },
                      ]
                    : [
                        { key: 'team-plus', label: 'Everything in Team' },
                        { key: 'audit', label: 'Advanced audit log' },
                      ]
                }
                ctaLabel={isEnterprise ? 'Contact sales' : 'Coming soon'}
                ctaDisabled
              />
            )
          })}
        </section>

        {!loading && sub?.plan && (
          <p
            className="font-mono"
            style={{ fontSize: 11, color: '#6e6e6e' }}
          >
            Current plan: <span className="text-wm-accent">{sub.plan.name}</span>{' '}
            — {sub.seats} seat{sub.seats === 1 ? '' : 's'} ·{' '}
            {formatCents(sub.plan.perSeatCents)} / seat / month.
          </p>
        )}
      </div>
    </div>
  )
}
