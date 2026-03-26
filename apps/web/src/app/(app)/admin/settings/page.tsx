'use client'

import { useState } from 'react'
import { Server, Shield, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'

export default function AdminSettingsPage() {
  const [smtp, setSmtp] = useState({
    smtpPort: '25',
    submissionPort: '587',
    sslPort: '465',
    maxMessageSize: '25',
    tlsMode: 'Required',
  })
  const [limits, setLimits] = useState({
    emailsPerUser: '1,000',
    emailsPerHour: '100',
    defaultMailboxQuota: '5',
    maxRecipientsPerEmail: '50',
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-wm-border bg-wm-surface px-8 py-4">
        <h1 className="text-lg font-semibold text-wm-text-primary">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex flex-col gap-6">
          {/* SMTP Configuration */}
          <div className="border border-wm-border bg-wm-surface p-6">
            <div className="flex items-center gap-2 mb-5">
              <Server className="h-4 w-4 text-wm-accent" />
              <h3 className="text-sm font-semibold text-wm-text-primary">SMTP Configuration</h3>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <InputField
                label="SMTP Port"
                value={smtp.smtpPort}
                onChange={(e) => setSmtp((s) => ({ ...s, smtpPort: e.target.value }))}
              />
              <InputField
                label="Submission Port"
                value={smtp.submissionPort}
                onChange={(e) => setSmtp((s) => ({ ...s, submissionPort: e.target.value }))}
              />
              <InputField
                label="SSL Port"
                value={smtp.sslPort}
                onChange={(e) => setSmtp((s) => ({ ...s, sslPort: e.target.value }))}
              />
              <InputField
                label="Max Message Size"
                value={smtp.maxMessageSize}
                hint="MB"
                onChange={(e) => setSmtp((s) => ({ ...s, maxMessageSize: e.target.value }))}
              />
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-sm font-medium text-wm-text-secondary">TLS Mode</label>
                <Badge variant="accent">{smtp.tlsMode}</Badge>
              </div>
            </div>
          </div>

          {/* Rate Limits & Quotas */}
          <div className="border border-wm-border bg-wm-surface p-6">
            <div className="flex items-center gap-2 mb-5">
              <Shield className="h-4 w-4 text-wm-accent" />
              <h3 className="text-sm font-semibold text-wm-text-primary">Rate Limits & Quotas</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="Emails per user / day"
                value={limits.emailsPerUser}
                onChange={(e) => setLimits((l) => ({ ...l, emailsPerUser: e.target.value }))}
              />
              <InputField
                label="Emails per hour limit"
                value={limits.emailsPerHour}
                onChange={(e) => setLimits((l) => ({ ...l, emailsPerHour: e.target.value }))}
              />
              <InputField
                label="Default mailbox quota"
                value={limits.defaultMailboxQuota}
                hint="GB"
                onChange={(e) => setLimits((l) => ({ ...l, defaultMailboxQuota: e.target.value }))}
              />
              <InputField
                label="Max recipients per email"
                value={limits.maxRecipientsPerEmail}
                onChange={(e) => setLimits((l) => ({ ...l, maxRecipientsPerEmail: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="primary" icon={<Save className="h-4 w-4" />}>Save Changes</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
