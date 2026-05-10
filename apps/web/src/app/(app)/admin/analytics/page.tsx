'use client'

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { BarChart } from '@/components/admin/bar-chart'
import { api } from '@/lib/api-client'

interface AnalyticsKpis {
  sent: number
  delivered: number
  deliveredPct: number
  bounced: number
  bouncePct: number
  opened: number
  openPct: number
  clicked: number
  clickPct: number
  avgDeliverMs: number
}

interface AnalyticsResponse {
  data: {
    kpis: AnalyticsKpis
    dailySent: { date: string; count: number }[]
    topSenders: { userId: string | null; name: string; count: number }[]
    rangeDays: number
  }
}

const RANGE_OPTIONS: { id: '7d' | '30d' | '90d'; label: string }[] = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
]

/**
 * `/admin/analytics` — Pencil reference: `AdminV3-Analytics` (`m7EUl`).
 *
 * KPI strip + 30-day bar chart + top-sender list. Wired to
 * `GET /api/v1/admin/analytics?range=30d`. The big lime "Sent" tile in
 * the top-left mirrors the Pencil — every other KPI is a percentage
 * with a dimmed label, plus a single avg-delivery-time tile.
 */
export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [data, setData] = useState<AnalyticsResponse['data'] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get<AnalyticsResponse>(`/api/v1/admin/analytics?range=${range}`)
      .then((res) => {
        if (cancelled) return
        setData(res.data)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range])

  const kpis = data?.kpis
  const avgSeconds = kpis ? Math.max(0, Math.round(kpis.avgDeliverMs / 1000)) : 0

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar
        scope="Admin"
        page="Analytics"
        rightSlot={
          <div role="tablist" className="inline-flex overflow-hidden rounded-full border border-wm-border bg-wm-surface">
            {RANGE_OPTIONS.map((opt) => {
              const active = opt.id === range
              return (
                <button
                  key={opt.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setRange(opt.id)}
                  className={
                    'cursor-pointer px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[1px] transition-colors ' +
                    (active
                      ? 'bg-wm-accent text-wm-text-on-accent'
                      : 'text-wm-text-secondary hover:text-wm-text-primary')
                  }
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        }
      />

      <div className="flex flex-col overflow-y-auto" style={{ gap: 24, padding: '28px 32px' }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h1 className="font-mono font-bold text-wm-text-primary" style={{ fontSize: 30 }}>
            Analytics
          </h1>
          <p className="font-mono" style={{ fontSize: 12, color: '#6e6e6e' }}>
            Delivery, engagement, and sender activity over the selected window.
          </p>
        </div>

        {/* KPI strip — Sent tile is the big lime card; others are smaller. */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {/* Sent — big lime tile */}
          <div
            className="md:col-span-3 xl:col-span-2 flex flex-col gap-2 border border-wm-accent/40 bg-wm-accent/10 px-6 py-5"
          >
            <div className="flex items-center gap-2">
              <Send className="h-3.5 w-3.5 text-wm-accent" />
              <p className="font-mono text-[10px] font-semibold tracking-[1px] uppercase text-wm-accent">
                Sent
              </p>
            </div>
            <span className="font-mono text-[36px] font-bold leading-none text-wm-text-primary">
              {loading ? '…' : (kpis?.sent ?? 0).toLocaleString()}
            </span>
            <span className="font-mono text-[11px] text-wm-text-secondary">
              messages over {data?.rangeDays ?? '—'}d
            </span>
          </div>
          <KpiTile label="Delivered" value={kpis?.deliveredPct} suffix="%" loading={loading} />
          <KpiTile label="Bounce" value={kpis?.bouncePct} suffix="%" loading={loading} />
          <KpiTile label="Open" value={kpis?.openPct} suffix="%" loading={loading} />
          <KpiTile label="Click" value={kpis?.clickPct} suffix="%" loading={loading} />
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <KpiTile
            label="Avg delivery"
            value={loading ? null : avgSeconds}
            suffix="s"
            loading={loading}
          />
        </section>

        {/* Bar chart — full width below */}
        <section className="flex flex-col gap-3 border border-wm-border bg-wm-surface p-6">
          <header className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
              Sent over time
            </h2>
            <span className="font-mono text-[10px] text-wm-text-tertiary">
              {data?.dailySent.length ?? 0} days
            </span>
          </header>
          <BarChart
            data={data?.dailySent ?? []}
            ariaLabel="Daily sent count"
            height={140}
          />
        </section>

        {/* Top senders */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-3 border border-wm-border bg-wm-surface p-6">
            <header className="flex items-baseline justify-between">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
                Active senders
              </h2>
              <span className="font-mono text-[10px] text-wm-text-tertiary">
                Top {data?.topSenders.length ?? 0}
              </span>
            </header>
            {loading ? (
              <p className="font-mono text-[11px] text-wm-text-muted">Loading…</p>
            ) : (data?.topSenders ?? []).length === 0 ? (
              <p className="font-mono text-[11px] text-wm-text-muted">
                No outbound mail in this window.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {data!.topSenders.map((s, i) => (
                  <li
                    key={`${s.userId ?? 'addr'}-${i}`}
                    className="flex items-center gap-3 border-b border-wm-border pb-2 last:border-b-0"
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-wm-bg font-mono text-[10px] font-bold text-wm-text-tertiary">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate font-sans text-[13px] text-wm-text-primary">
                      {s.name}
                    </span>
                    <span className="font-mono text-[12px] font-semibold text-wm-accent">
                      {s.count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function KpiTile({
  label,
  value,
  suffix,
  loading,
}: {
  label: string
  value: number | null | undefined
  suffix?: string
  loading: boolean
}) {
  const display = loading ? '…' : value === null || value === undefined ? '—' : `${value}${suffix ?? ''}`
  return (
    <div className="flex flex-col gap-2 border border-wm-border bg-wm-surface px-6 py-5">
      <p className="font-mono text-[10px] font-semibold tracking-[1px] uppercase text-wm-text-muted">
        {label}
      </p>
      <span className="font-mono text-[28px] font-bold leading-none text-wm-text-primary">
        {display}
      </span>
    </div>
  )
}
