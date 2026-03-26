'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScrollText, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { formatRelativeTime } from '@/lib/utils'

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

const ACTION_COLORS: Record<string, 'accent' | 'info' | 'warning' | 'error' | 'default'> = {
  'domain.created': 'accent',
  'domain.verified': 'info',
  'domain.deleted': 'error',
  'mailbox.created': 'accent',
  'mailbox.deleted': 'error',
  'organization.created': 'accent',
  'member.role_changed': 'warning',
  'member.removed': 'error',
}

export default function AuditLogsPage() {
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

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-wm-text-muted" />
        <h1 className="text-2xl font-semibold text-wm-text-primary">Audit Logs</h1>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={fetchLogs} loading={loading}>
          Refresh
        </Button>
      </div>

      <div className="border border-wm-border">
        <div className="flex bg-wm-surface-hover px-4 py-2.5 font-mono text-[10px] font-semibold text-wm-text-muted">
          <span className="w-36">User</span>
          <span className="w-40">Action</span>
          <span className="flex-1">Details</span>
          <span className="w-28 text-right">Time</span>
        </div>
        {logs.map((log) => (
          <div key={log.id} className="flex items-center border-t border-wm-border px-4 py-3">
            <div className="flex w-36 items-center gap-2">
              <Avatar name={log.userName || 'System'} size="sm" />
              <span className="truncate font-mono text-xs text-wm-text-secondary">
                {log.userName || 'System'}
              </span>
            </div>
            <div className="w-40">
              <Badge variant={ACTION_COLORS[log.action] || 'default'} size="sm">
                {log.action}
              </Badge>
            </div>
            <div className="flex-1 truncate font-mono text-xs text-wm-text-muted">
              {log.resource}
              {log.resourceId && `: ${log.resourceId.slice(0, 20)}...`}
              {log.details && Object.keys(log.details).length > 0 && (
                <span className="ml-2 text-wm-text-muted">
                  {JSON.stringify(log.details).slice(0, 60)}
                </span>
              )}
            </div>
            <span className="w-28 text-right font-mono text-xs text-wm-text-muted">
              {formatRelativeTime(new Date(log.createdAt))}
            </span>
          </div>
        ))}
        {logs.length === 0 && !loading && (
          <div className="flex items-center justify-center py-12">
            <p className="font-mono text-sm text-wm-text-muted">No audit logs yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
