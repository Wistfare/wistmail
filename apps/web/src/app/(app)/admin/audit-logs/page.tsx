'use client'

import { useState, useEffect, useCallback } from 'react'
import { Avatar } from '@/components/ui/avatar'
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

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (logDate.getTime() === today.getTime()) return 'Today'
  if (logDate.getTime() === yesterday.getTime()) return 'Yesterday'
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function describeAction(log: AuditLog): { text: string; detail: string } {
  const details = log.details as Record<string, string>
  switch (log.action) {
    case 'user.register': return { text: 'registered account', detail: details.email || '' }
    case 'user.created': return { text: 'created user', detail: `${details.email || ''}${details.invitedVia ? ` (invited via ${details.invitedVia})` : ''}` }
    case 'domain.created': return { text: 'added domain', detail: details.name || '' }
    case 'domain.verified': return { text: 'verified domain DNS', detail: '' }
    case 'mailbox.created': return { text: 'created mailbox', detail: details.address || '' }
    case 'organization.created': return { text: 'created organization', detail: details.name || '' }
    case 'member.role_changed': return { text: 'changed user role', detail: `→ ${details.newRole || ''}` }
    case 'member.removed': return { text: 'removed user', detail: '' }
    default: return { text: log.action.replace(/\./g, ' '), detail: '' }
  }
}

const ACTION_COLORS: Record<string, string> = {
  'user.register': 'bg-wm-accent',
  'user.created': 'bg-wm-accent',
  'domain.created': 'bg-wm-info',
  'domain.verified': 'bg-wm-info',
  'mailbox.created': 'bg-wm-accent',
  'organization.created': 'bg-wm-accent',
  'member.role_changed': 'bg-wm-warning',
  'member.removed': 'bg-wm-error',
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async () => {
    try {
      const res = await api.get<{ data: AuditLog[] }>('/api/v1/admin/audit-logs?limit=100')
      setLogs(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + poll every 10 seconds for real-time updates
  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 10000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  // Group logs by date
  const grouped: Record<string, AuditLog[]> = {}
  for (const log of logs) {
    const label = formatDateLabel(log.createdAt)
    if (!grouped[label]) grouped[label] = []
    grouped[label].push(log)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-wm-border bg-wm-surface px-8 py-4">
        <h1 className="text-lg font-semibold text-wm-text-primary">Audit Log</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin border-2 border-wm-accent border-t-transparent" />
          </div>
        )}

        {Object.entries(grouped).map(([dateLabel, dateLogs]) => (
          <div key={dateLabel}>
            <div className="sticky top-0 z-10 border-b border-wm-border bg-wm-bg px-8 py-2">
              <span className="font-mono text-[10px] font-semibold tracking-[1px] text-wm-text-muted">
                {dateLabel.toUpperCase()}
              </span>
            </div>

            {dateLogs.map((log) => {
              const dotColor = ACTION_COLORS[log.action] || 'bg-wm-text-muted'
              const { text, detail } = describeAction(log)
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-4 border-b border-wm-border px-8 py-3 transition-colors hover:bg-wm-surface-hover"
                >
                  <div className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                  <Avatar name={log.userName || 'System'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div>
                      <span className="text-sm font-medium text-wm-text-primary">
                        {log.userName || 'System'}
                      </span>
                      <span className="text-sm text-wm-text-muted">{' '}{text}</span>
                    </div>
                    {detail && (
                      <p className="truncate font-mono text-[10px] text-wm-text-tertiary">{detail}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-xs text-wm-text-muted">
                    {formatTime(new Date(log.createdAt))}
                  </span>
                </div>
              )
            })}
          </div>
        ))}

        {logs.length === 0 && !loading && (
          <div className="flex items-center justify-center py-16">
            <p className="font-mono text-sm text-wm-text-muted">No audit logs yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
