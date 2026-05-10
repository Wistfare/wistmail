'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Plus, Globe, CheckCircle2, Circle } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { api } from '@/lib/api-client'

interface AdminDomain {
  id: string
  name: string
  verified: boolean
  status: string
  mxVerified: boolean
  spfVerified: boolean
  dkimVerified: boolean
  dmarcVerified: boolean
  messages30d: number
  lastCheckedAt: string
  createdAt: string
}

const DNS_LABELS: { key: keyof Pick<AdminDomain, 'mxVerified' | 'spfVerified' | 'dkimVerified' | 'dmarcVerified'>; label: string }[] = [
  { key: 'mxVerified', label: 'MX' },
  { key: 'spfVerified', label: 'SPF' },
  { key: 'dkimVerified', label: 'DKIM' },
  { key: 'dmarcVerified', label: 'DMARC' },
]

/**
 * `/admin/domains` — Pencil reference: `AdminV3-Domains` (`ZowPj`).
 *
 * Admin-scope domain list (vs `/settings/domains` which is per-user).
 * Each row shows the verified pill, four DNS chips (MX/SPF/DKIM/DMARC),
 * 30-day message count, and last-checked timestamp. A warning card
 * appears at the top when any domain has DNS issues.
 *
 * Wired to `GET /api/v1/admin/domains`. The "Add domain" CTA bounces
 * over to `/setup/domain` which is the existing onboarding flow.
 */
export default function AdminDomainsPage() {
  const [domains, setDomains] = useState<AdminDomain[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .get<{ data: AdminDomain[] }>('/api/v1/admin/domains')
      .then((res) => {
        if (cancelled) return
        setDomains(res.data ?? [])
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const unverifiedWithIssues = domains.filter(
    (d) =>
      !d.verified ||
      !d.mxVerified ||
      !d.spfVerified ||
      !d.dkimVerified ||
      !d.dmarcVerified,
  )

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar
        scope="Admin"
        page="Domains"
        rightSlot={
          <Link
            href="/setup/domain"
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
              Add domain
            </span>
          </Link>
        }
      />

      <div className="flex flex-col overflow-y-auto" style={{ gap: 24, padding: '28px 32px' }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h1 className="font-mono font-bold text-wm-text-primary" style={{ fontSize: 30 }}>
            Domains
          </h1>
          <p className="font-mono" style={{ fontSize: 12, color: '#6e6e6e' }}>
            DNS-verified sending domains for this workspace.
          </p>
        </div>

        {/* DNS warning card — only when at least one domain has issues. */}
        {!loading && unverifiedWithIssues.length > 0 && (
          <div
            className="flex items-start gap-3 border border-wm-warning/30 bg-wm-warning/5 px-5 py-4"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-wm-warning" />
            <div className="flex flex-col gap-1">
              <p className="font-sans text-[13px] font-semibold text-wm-text-primary">
                {unverifiedWithIssues.length === 1
                  ? '1 domain has DNS issues'
                  : `${unverifiedWithIssues.length} domains have DNS issues`}
              </p>
              <p className="font-mono text-[11px] text-wm-text-secondary">
                Outbound deliverability suffers when MX / SPF / DKIM / DMARC are not all verified.
              </p>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-wm-border bg-wm-surface">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
            </div>
          ) : domains.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Globe className="h-6 w-6 text-wm-text-muted" />
              <p className="font-mono text-[12px] text-wm-text-secondary">
                No sending domains yet.
              </p>
              <Link
                href="/setup/domain"
                className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-accent hover:underline"
              >
                Add your first domain →
              </Link>
            </div>
          ) : (
            <table className="w-full font-mono text-[12px]">
              <thead className="border-b border-wm-border bg-wm-bg/50 text-left">
                <tr className="text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
                  <th className="px-5 py-3">Domain</th>
                  <th className="px-5 py-3">DNS</th>
                  <th className="px-5 py-3 text-right">Sent (30d)</th>
                  <th className="px-5 py-3">Last checked</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-wm-border last:border-b-0 transition-colors hover:bg-wm-surface-hover"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Globe className="h-3.5 w-3.5 text-wm-text-muted" />
                        <div className="flex flex-col">
                          <span className="font-sans text-[13px] font-medium text-wm-text-primary">
                            {d.name}
                          </span>
                          <VerifiedPill verified={d.verified} status={d.status} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        {DNS_LABELS.map((dns) => (
                          <DnsChip
                            key={dns.key}
                            label={dns.label}
                            verified={d[dns.key]}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right text-wm-text-primary">
                      {d.messages30d.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-wm-text-tertiary">
                      {new Date(d.lastCheckedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function VerifiedPill({ verified, status }: { verified: boolean; status: string }) {
  const tone = verified
    ? 'bg-wm-accent/15 text-wm-accent border-wm-accent/30'
    : 'bg-wm-warning/15 text-wm-warning border-wm-warning/30'
  return (
    <span
      className={`mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[1px] ${tone}`}
    >
      {verified ? 'Verified' : status || 'Pending'}
    </span>
  )
}

function DnsChip({ label, verified }: { label: string; verified: boolean }) {
  const Icon = verified ? CheckCircle2 : Circle
  const tone = verified
    ? 'bg-wm-accent/10 text-wm-accent border-wm-accent/30'
    : 'bg-wm-surface text-wm-text-muted border-wm-border'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${tone}`}
      title={`${label}: ${verified ? 'verified' : 'unverified'}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  )
}
