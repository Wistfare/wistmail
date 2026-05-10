'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ScrollText } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { StatCard } from '@/components/ui'
import { BarChart } from '@/components/admin/bar-chart'
import { api } from '@/lib/api-client'
import { formatBytes, formatRelativeTime } from '@/lib/utils'

interface AuditLogEntry {
  id: string
  userId: string
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: Record<string, unknown>
  createdAt: string
  userName?: string
}

interface OverviewStats {
  users: number
  storageBytes: number
  messagesSent: number
  verifiedDomains: number
  totalDomains: number
  dailySent: { date: string; count: number }[]
  topSenders: { userId: string | null; name: string; count: number }[]
}

type RangeId = 'daily' | 'weekly' | 'monthly'
const RANGE_TABS: { id: RangeId; label: string; days: number }[] = [
  { id: 'daily', label: 'Daily', days: 7 },
  { id: 'weekly', label: 'Weekly', days: 30 },
  { id: 'monthly', label: 'Monthly', days: 90 },
]

/**
 * `/admin` — Pencil reference: `AdminV3-Overview` (`boHfA`).
 *
 * V3 polish:
 *   - 4 stat cards bound to /api/v1/admin/overview-stats (no `—` placeholders)
 *   - 7-day bar chart with Daily/Weekly/Monthly tabs (re-fetches with new range)
 *   - Right-rail "Active senders" list (top 5 by message count)
 *   - Audit timeline (last 10 entries) — unchanged, already on real data
 */
export default function AdminOverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [audit, setAudit] = useState<AuditLogEntry[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [auditLoading, setAuditLoading] = useState(true)
  const [range, setRange] = useState<RangeId>('daily')

  // Stats refetch when range changes; audit only loads once.
  useEffect(() => {
    let cancelled = false
    const days = RANGE_TABS.find((r) => r.id === range)?.days ?? 7
    setStatsLoading(true)
    api
      .get<{ data: OverviewStats }>(`/api/v1/admin/overview-stats?range=${days}d`)
      .then((res) => {
        if (cancelled) return
        setStats(res.data)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setStatsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range])

  useEffect(() => {
    let cancelled = false
    api
      .get<{ data: AuditLogEntry[]; logs?: AuditLogEntry[] }>('/api/v1/admin/audit-logs?limit=10')
      .then((res) => {
        if (cancelled) return
        setAudit(res.data ?? res.logs ?? [])
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setAuditLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const verifiedDomains = stats?.verifiedDomains ?? 0
  const totalDomains = stats?.totalDomains ?? 0

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar
        scope="Admin"
        page="Overview"
        rightSlot={
          <Link
            href="/admin/users"
            className="inline-flex cursor-pointer items-center bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
            style={{
              gap: 6,
              padding: '8px 14px',
              borderRadius: 18,
              border: '1px solid var(--color-wm-border)',
            }}
          >
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 11, letterSpacing: 1 }}
            >
              Manage users
            </span>
            <ArrowRight style={{ width: 13, height: 13 }} />
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
            Overview
          </h1>
          <p
            className="font-mono"
            style={{ fontSize: 12, color: '#6e6e6e' }}
          >
            Workspace activity, usage and health.
          </p>
        </div>

        {/* Stat strip — Pencil shows 24 / 6 GB / 12,847 / 3 etc. */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="USERS"
            value={statsLoading ? '…' : (stats?.users ?? 0).toString()}
            change={
              statsLoading
                ? ''
                : `${stats?.users ?? 0} member${stats?.users === 1 ? '' : 's'}`
            }
            changeType="neutral"
          />
          <StatCard
            title="STORAGE"
            value={statsLoading ? '…' : formatBytes(stats?.storageBytes ?? 0)}
            change="Across all mailboxes"
            changeType="neutral"
          />
          <StatCard
            title="MESSAGES"
            value={statsLoading ? '…' : (stats?.messagesSent ?? 0).toLocaleString()}
            change={`Sent in this window`}
            changeType="neutral"
          />
          <StatCard
            title="DOMAINS"
            value={statsLoading ? '…' : `${verifiedDomains} / ${totalDomains}`}
            change={`${verifiedDomains} verified`}
            changeType={verifiedDomains > 0 ? 'positive' : 'neutral'}
          />
        </section>

        {/* Chart + senders rail — Pencil shows the bar chart taking 2/3 width
            on desktop, with the active senders list pinned to the right. */}
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2 flex flex-col gap-4 border border-wm-border bg-wm-surface p-6">
            <header className="flex items-center justify-between">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
                Sent over time
              </h2>
              <div role="tablist" className="inline-flex overflow-hidden rounded-full border border-wm-border bg-wm-bg">
                {RANGE_TABS.map((opt) => {
                  const active = opt.id === range
                  return (
                    <button
                      key={opt.id}
                      role="tab"
                      type="button"
                      aria-selected={active}
                      onClick={() => setRange(opt.id)}
                      className={
                        'cursor-pointer px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[1px] transition-colors ' +
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
            </header>
            <BarChart
              data={stats?.dailySent ?? []}
              ariaLabel="Daily sent count"
              height={120}
            />
          </div>
          <div className="flex flex-col gap-3 border border-wm-border bg-wm-surface p-6">
            <header className="flex items-baseline justify-between">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
                Active senders
              </h2>
              <span className="font-mono text-[10px] text-wm-text-tertiary">Top 5</span>
            </header>
            {statsLoading ? (
              <p className="font-mono text-[11px] text-wm-text-muted">Loading…</p>
            ) : (stats?.topSenders ?? []).length === 0 ? (
              <p className="font-mono text-[11px] text-wm-text-muted">
                No outbound mail yet.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {stats!.topSenders.map((s, i) => (
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

        {/* Audit timeline — Pencil bottom-left list. */}
        <section className="flex flex-col gap-3">
          <header className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
              Recent activity
            </h2>
            <Link
              href="/admin/audit-logs"
              className="font-mono text-[11px] text-wm-accent hover:underline"
            >
              View all →
            </Link>
          </header>
          <div className="flex flex-col rounded-lg border border-wm-border bg-wm-surface">
            {auditLoading ? (
              <p className="px-5 py-6 text-center font-mono text-[11px] text-wm-text-muted">
                Loading…
              </p>
            ) : audit.length === 0 ? (
              <p className="px-5 py-6 text-center font-mono text-[11px] text-wm-text-muted">
                No activity yet.
              </p>
            ) : (
              audit.slice(0, 10).map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 border-b border-wm-border px-5 py-3 last:border-b-0"
                >
                  <ScrollText className="h-3.5 w-3.5 text-wm-text-muted" />
                  <span className="flex-1 truncate font-mono text-[12px] text-wm-text-primary">
                    <span className="text-wm-text-secondary">
                      {row.userName ?? row.userId}
                    </span>{' '}
                    {row.action.toLowerCase().replace(/_/g, ' ')}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-wm-text-tertiary">
                    {formatRelativeTime(new Date(row.createdAt))}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Quick links */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <QuickLink
            href="/admin/users"
            label="Users"
            description="Invite, suspend, or change roles"
            cta="Manage"
          />
          <QuickLink
            href="/admin/organization"
            label="Organization"
            description="Workspace name, defaults, plan"
            cta="Configure"
          />
          <QuickLink
            href="/admin/audit-logs"
            label="Audit log"
            description="Full timeline of admin actions"
            cta="View"
          />
        </section>
      </div>
    </div>
  )
}

function QuickLink({
  href,
  label,
  description,
  cta,
}: {
  href: string
  label: string
  description: string
  cta: string
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 rounded-xl border border-wm-border bg-wm-surface p-5 transition-colors hover:border-wm-accent/50 hover:bg-wm-surface-hover"
    >
      <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
        {label}
      </span>
      <p className="font-sans text-[14px] font-medium text-wm-text-primary">
        {description}
      </p>
      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-accent">
        {cta}
        <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  )
}
