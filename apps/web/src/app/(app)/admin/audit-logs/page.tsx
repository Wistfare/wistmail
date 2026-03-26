'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

function describeAction(log: AuditLog): string {
  const details = log.details as Record<string, string>
  switch (log.action) {
    case 'domain.created': return `created domain ${details.name || ''}`
    case 'domain.verified': return `verified domain DNS records`
    case 'mailbox.created': return `created mailbox ${details.address || ''}`
    case 'organization.created': return `created organization "${details.name || ''}"`
    case 'member.role_changed': return `changed role to ${details.newRole || ''}`
    case 'member.removed': return `removed a team member`
    default: return log.action.replace(/\./g, ' ')
  }
}

const ACTION_COLORS: Record<string, string> = {
  'domain.created': 'bg-wm-accent',
  'domain.verified': 'bg-wm-info',
  'mailbox.created': 'bg-wm-accent',
  'organization.created': 'bg-wm-accent',
  'member.role_changed': 'bg-wm-warning',
  'member.removed': 'bg-wm-error',
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: AuditLog[] }>('/api/v1/admin/audit-logs?limit=100')
      setLogs(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

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
        <div className="flex-1" />
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={fetchLogs} loading={loading}>
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([dateLabel, dateLogs]) => (
          <div key={dateLabel}>
            <div className="sticky top-0 z-10 border-b border-wm-border bg-wm-bg px-8 py-2">
              <span className="font-mono text-[10px] font-semibold tracking-[1px] text-wm-text-muted">
                {dateLabel.toUpperCase()}
              </span>
            </div>

            {dateLogs.map((log) => {
              const dotColor = ACTION_COLORS[log.action] || 'bg-wm-text-muted'
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-4 border-b border-wm-border px-8 py-3 transition-colors hover:bg-wm-surface-hover"
                >
                  <div className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                  <Avatar name={log.userName || 'System'} size="sm" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-wm-text-primary">
                      {log.userName?.split(' ')[0] || 'System'}
                    </span>
                    <span className="text-sm text-wm-text-muted">
                      {' '}{describeAction(log)}
                    </span>
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
