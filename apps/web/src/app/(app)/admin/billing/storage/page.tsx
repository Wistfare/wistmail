'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { Avatar, EmptyState, StatCard } from '@/components/ui'
import { api } from '@/lib/api-client'
import { formatBytes, formatCents } from '@/lib/utils'

interface BreakdownResponse {
  data: {
    totalBytes: number
    byCategory: {
      mail: number
      attachments: number
      drafts: number
      trash: number
    }
    byUser: Array<{ userId: string; name: string; bytes: number }>
  }
}

interface SubResponse {
  data: {
    seats: number
    plan: {
      name: string
      perSeatCents: number
      includedStorageMbPerSeat?: number
    } | null
  } | null
}

const CATEGORY_COLORS: Record<string, string> = {
  mail: '#BFFF00',
  attachments: '#7AA2FF',
  drafts: '#FFB347',
  trash: '#FF6B6B',
}

const CATEGORY_LABEL: Record<string, string> = {
  mail: 'Mail',
  attachments: 'Attachments',
  drafts: 'Drafts',
  trash: 'Trash',
}

/**
 * `/admin/billing/storage` — Pencil reference: `Storage` page (`zKxtf`).
 *
 * Storage breakdown by category + per-user list. Numbers come from the
 * read-only `/api/v1/billing/storage-breakdown` endpoint, which falls
 * back to 0 for tables that don't yet have a size column rather than
 * fabricating values — see route comments.
 */
export default function AdminBillingStoragePage() {
  const [data, setData] = useState<BreakdownResponse['data'] | null>(null)
  const [sub, setSub] = useState<SubResponse['data']>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get<BreakdownResponse>('/api/v1/billing/storage-breakdown'),
      api.get<SubResponse>('/api/v1/billing/subscription'),
    ]).then((res) => {
      if (cancelled) return
      const [b, s] = res
      if (b.status === 'fulfilled') setData(b.value.data)
      if (s.status === 'fulfilled') setSub(s.value.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const totalBytes = data?.totalBytes ?? 0
  const seats = sub?.seats ?? 0
  const includedMbPerSeat = sub?.plan?.includedStorageMbPerSeat ?? 100_000
  // Convert MB → bytes using 1024 ladder for the quota display so the math
  // matches what `formatBytes` reads against.
  const quotaBytes = seats * includedMbPerSeat * 1_000_000
  const usedPct =
    quotaBytes > 0 ? Math.min(100, Math.round((totalBytes / quotaBytes) * 100)) : 0

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar
        scope="Admin / Billing"
        page="Storage"
        rightSlot={
          <Link
            href="/admin/billing/plan"
            className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
            style={{
              gap: 6,
              padding: '8px 14px',
              borderRadius: 18,
              boxShadow: '0 3px 14px 0 rgba(191,255,0,0.25)',
              color: '#000000',
            }}
          >
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 11, letterSpacing: 1 }}
            >
              Increase storage
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
            Storage
          </h1>
          <p
            className="font-mono"
            style={{ fontSize: 12, color: '#6e6e6e' }}
          >
            Where the workspace's bytes live, and who owns them.
          </p>
        </div>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 border border-wm-border bg-wm-surface p-6">
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
                  Used this cycle
                </span>
                <span className="font-mono text-[40px] font-bold leading-none text-wm-text-primary">
                  {loading ? '…' : formatBytes(totalBytes)}
                </span>
              </div>
              <span className="font-mono text-[12px] text-wm-text-tertiary">
                of {formatBytes(quotaBytes)} ({usedPct}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden bg-wm-bg">
              <div
                className="h-full bg-wm-accent transition-all"
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <ul className="grid grid-cols-2 gap-2 pt-2">
              {(['mail', 'attachments', 'drafts', 'trash'] as const).map((cat) => {
                const bytes = data?.byCategory[cat] ?? 0
                return (
                  <li
                    key={cat}
                    className="flex items-center gap-2.5 border border-wm-border bg-wm-bg px-3 py-2.5"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0"
                      style={{ background: CATEGORY_COLORS[cat] }}
                    />
                    <span className="flex-1 font-mono text-[12px] text-wm-text-secondary">
                      {CATEGORY_LABEL[cat]}
                    </span>
                    <span className="font-mono text-[12px] text-wm-text-primary tabular-nums">
                      {formatBytes(bytes)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <StatCard
              title="PROJECTED COST"
              value={
                sub?.plan
                  ? formatCents(seats * sub.plan.perSeatCents)
                  : '—'
              }
              change={
                sub?.plan
                  ? `${seats} × ${formatCents(sub.plan.perSeatCents)} / month`
                  : 'No active plan'
              }
              changeType="neutral"
            />
            <StatCard
              title="STORAGE PER USER"
              value={
                seats > 0 ? formatBytes(totalBytes / seats) : '—'
              }
              change={`${seats} active seat${seats === 1 ? '' : 's'}`}
              changeType="neutral"
            />
            <StatCard
              title="INCLUDED PER SEAT"
              value={formatBytes(includedMbPerSeat * 1_000_000)}
              change="Resets monthly"
              changeType="neutral"
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <header className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
              By user
            </h2>
            <span className="font-mono text-[11px] text-wm-text-tertiary">
              {data?.byUser.length ?? 0} member
              {(data?.byUser.length ?? 0) === 1 ? '' : 's'}
            </span>
          </header>
          <div className="overflow-hidden border border-wm-border bg-wm-surface">
            {loading ? (
              <p className="px-5 py-10 text-center font-mono text-[11px] text-wm-text-muted">
                Loading…
              </p>
            ) : (data?.byUser.length ?? 0) === 0 ? (
              <EmptyState
                title="No usage yet"
                description="Once mailboxes start receiving mail, the usage list will populate here."
              />
            ) : (
              <table className="w-full font-mono text-[12px]">
                <thead className="border-b border-wm-border bg-wm-bg/40 text-left">
                  <tr className="text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
                    <th className="px-5 py-3">Member</th>
                    <th className="px-5 py-3 text-right">Used</th>
                    <th className="px-5 py-3 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.byUser.map((u) => {
                    const share =
                      totalBytes > 0
                        ? Math.round((u.bytes / totalBytes) * 100)
                        : 0
                    return (
                      <tr
                        key={u.userId}
                        className="border-b border-wm-border last:border-b-0 hover:bg-wm-surface-hover"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name || u.userId} size="sm" />
                            <span className="text-wm-text-primary">
                              {u.name || u.userId}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-wm-text-secondary">
                          {formatBytes(u.bytes)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-wm-text-tertiary">
                          {share}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
