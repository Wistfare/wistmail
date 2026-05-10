'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { SettingsTopBar } from '@/components/shell'
import { Avatar } from '@/components/ui/avatar'
import { ActionChip, categorizeAction } from '@/components/admin/action-chip'
import { FilterPills } from '@/components/email/filter-pills'
import { api } from '@/lib/api-client'

type AuditLog = {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  action: string
  resource: string
  resourceId: string | null
  details: Record<string, unknown>
  ipAddress: string | null
  createdAt: string
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

type RangeFilter = 'all' | '7d'
type ActorFilter = 'all' | string

/**
 * `/admin/audit-logs` — Pencil reference: `AdminV3-AuditLog` (`yDvd5`).
 *
 * V3 timeline-style table with action chips colour-coded by category
 * (auth=blue, member=green, role=lime, billing=amber, danger=red).
 * Filter pills: All actions / Last 7d / All actors. Polls every 10s
 * for real-time updates.
 */
export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all')
  const [actorFilter, setActorFilter] = useState<ActorFilter>('all')

  const fetchLogs = useCallback(async () => {
    try {
      const res = await api.get<{ data: AuditLog[] }>('/api/v1/admin/audit-logs?limit=200')
      setLogs(res.data ?? [])
    } catch {
      // swallow — UI shows the previous list rather than thrashing.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 10000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  // Distinct actor names for the actor pill row.
  const actors = useMemo(() => {
    const seen = new Set<string>()
    const out: { id: string; label: string }[] = []
    for (const log of logs) {
      const id = log.userId ?? 'system'
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, label: log.userName ?? 'System' })
    }
    return out
  }, [logs])

  const filtered = useMemo(() => {
    const since =
      rangeFilter === '7d' ? new Date(Date.now() - 7 * 86400_000) : null
    return logs.filter((log) => {
      if (since && new Date(log.createdAt) < since) return false
      if (actorFilter !== 'all' && (log.userId ?? 'system') !== actorFilter) return false
      return true
    })
  }, [logs, rangeFilter, actorFilter])

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar scope="Admin" page="Audit log" />

      <div className="flex flex-col" style={{ gap: 16, padding: '28px 32px 16px 32px' }}>
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h1 className="font-mono font-bold text-wm-text-primary" style={{ fontSize: 30 }}>
            Audit log
          </h1>
          <p className="font-mono" style={{ fontSize: 12, color: '#6e6e6e' }}>
            Every admin-relevant change in this workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FilterPills<RangeFilter>
            value={rangeFilter}
            options={[
              { id: 'all', label: 'All actions' },
              { id: '7d', label: 'Last 7d' },
            ]}
            onChange={setRangeFilter}
          />
          <FilterPills<string>
            value={actorFilter}
            options={[
              { id: 'all', label: 'All actors' },
              ...actors.slice(0, 5).map((a) => ({ id: a.id, label: a.label })),
            ]}
            onChange={setActorFilter}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '0 32px 32px 32px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="font-mono text-[12px] text-wm-text-muted">
              No matching audit entries.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-wm-border bg-wm-surface">
            <table className="w-full font-mono text-[12px]">
              <thead className="border-b border-wm-border bg-wm-bg/50 text-left">
                <tr className="text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Target</th>
                  <th className="px-5 py-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const category = categorizeAction(log.action)
                  void category // category is used internally by ActionChip
                  const target =
                    log.resourceId ??
                    (log.details as Record<string, string>)?.email ??
                    (log.details as Record<string, string>)?.name ??
                    log.resource ??
                    '—'
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-wm-border last:border-b-0 transition-colors hover:bg-wm-surface-hover"
                    >
                      <td className="px-5 py-3 text-wm-text-tertiary">
                        {formatTimestamp(log.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={log.userName || 'System'} size="sm" />
                          <span className="text-wm-text-primary">
                            {log.userName ?? 'System'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <ActionChip action={log.action} />
                      </td>
                      <td className="px-5 py-3 text-wm-text-secondary truncate max-w-[260px]">
                        {target}
                      </td>
                      <td className="px-5 py-3 text-wm-text-tertiary">
                        {log.ipAddress ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
