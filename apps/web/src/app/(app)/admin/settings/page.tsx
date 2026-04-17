'use client'

import { Server, Shield, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * Admin Settings — read-only system defaults.
 * These values are baked into the platform and cannot be modified from the UI.
 */
export default function AdminSettingsPage() {
  const smtp = [
    { label: 'SMTP Port', value: '25' },
    { label: 'Submission Port', value: '587' },
    { label: 'SSL Port', value: '465' },
    { label: 'Max Message Size', value: '25 MB' },
    { label: 'TLS Mode', value: 'Required', badge: true },
  ]

  const limits = [
    { label: 'Emails per user / day', value: '1,000' },
    { label: 'Emails per hour limit', value: '100' },
    { label: 'Default mailbox quota', value: '5 GB' },
    { label: 'Max recipients per email', value: '50' },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-wm-border bg-wm-surface px-8 py-4">
        <h1 className="text-lg font-semibold text-wm-text-primary">Settings</h1>
        <span className="font-mono text-xs text-wm-text-muted">System defaults</span>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex flex-col gap-6">
          {/* Read-only banner */}
          <div className="flex items-start gap-3 border border-wm-border bg-wm-surface p-4">
            <Lock className="mt-0.5 h-4 w-4 text-wm-text-muted" />
            <p className="font-mono text-xs text-wm-text-secondary">
              These are platform defaults. They cannot be modified from the dashboard.
            </p>
          </div>

          {/* SMTP Configuration */}
          <div className="border border-wm-border bg-wm-surface p-6">
            <div className="flex items-center gap-2 mb-5">
              <Server className="h-4 w-4 text-wm-accent" />
              <h3 className="text-sm font-semibold text-wm-text-primary">SMTP Configuration</h3>
            </div>

            <div className="grid grid-cols-3 gap-x-6 gap-y-5">
              {smtp.map((row) => (
                <div key={row.label}>
                  <p className="mb-1 font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted uppercase">{row.label}</p>
                  {row.badge ? (
                    <Badge variant="accent" size="sm">{row.value}</Badge>
                  ) : (
                    <p className="font-mono text-sm text-wm-text-primary">{row.value}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rate Limits & Quotas */}
          <div className="border border-wm-border bg-wm-surface p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="h-4 w-4 text-wm-accent" />
              <h3 className="text-sm font-semibold text-wm-text-primary">Rate Limits & Quotas</h3>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {limits.map((row) => (
                <div key={row.label}>
                  <p className="mb-1 font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted uppercase">{row.label}</p>
                  <p className="font-mono text-sm text-wm-text-primary">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
