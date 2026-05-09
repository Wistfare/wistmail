'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Plus, ScrollText } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { StatCard } from '@/components/ui'
import { api } from '@/lib/api-client'
import { formatRelativeTime } from '@/lib/utils'

interface Member {
  id: string
  userId: string
  name: string
  email: string
  role: string
  createdAt: string
}

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

interface Domain {
  id: string
  name: string
  verified: boolean
}

/**
 * `/admin` — Pencil reference: `AdminV3-Overview` (`boHfA`).
 *
 * Workspace dashboard:
 *   • 4 stat cards (members / storage / messages / domains)
 *   • Audit timeline (last 10 entries)
 *   • Quick links to Users / Domains / Audit log
 */
export default function AdminOverviewPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [audit, setAudit] = useState<AuditLogEntry[]>([])
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get<{ members: Member[] }>('/api/v1/admin/members'),
      api.get<{ logs: AuditLogEntry[] }>('/api/v1/admin/audit-logs?limit=10'),
      api.get<{ domains: Domain[] }>('/api/v1/setup/domains').catch(() => ({ domains: [] })),
    ]).then((results) => {
      if (cancelled) return
      const [m, a, d] = results
      if (m.status === 'fulfilled') setMembers(m.value.members ?? [])
      if (a.status === 'fulfilled') setAudit(a.value.logs ?? [])
      if (d.status === 'fulfilled') setDomains(d.value.domains ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const memberCount = members.length
  const verifiedDomains = domains.filter((d) => d.verified).length

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
            value={loading ? '…' : memberCount.toString()}
            change={loading ? '' : `${memberCount} member${memberCount === 1 ? '' : 's'}`}
            changeType="neutral"
          />
          <StatCard
            title="STORAGE"
            value="—"
            change="Live in /user/storage"
            changeType="neutral"
          />
          <StatCard
            title="MESSAGES"
            value="—"
            change="Live in /admin/stats"
            changeType="neutral"
          />
          <StatCard
            title="DOMAINS"
            value={loading ? '…' : `${verifiedDomains} / ${domains.length}`}
            change={`${verifiedDomains} verified`}
            changeType={verifiedDomains > 0 ? 'positive' : 'neutral'}
          />
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
            {loading ? (
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
// `Plus` exported for future invite shortcut on the overview header.
void Plus
