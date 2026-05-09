'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import { Button, InputField, SettingsCard } from '@/components/ui'
import { FieldStack } from '@/components/ui/field-stack'
import { api } from '@/lib/api-client'

/**
 * `/admin/users/new` — Pencil reference: `AdminV3-CreateUser` (`udt2q`).
 *
 * Wraps `POST /api/v1/admin/members` (existing route) with the V3
 * page chrome. The backend issues an invite email; the UI bounces
 * back to the user list on success.
 */
export default function AdminInviteUserPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email')
      return
    }
    setSending(true)
    try {
      await api.post('/api/v1/admin/members', { email, role })
      router.push('/admin/users')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send invitation')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1 hover:text-wm-accent"
          >
            <ArrowLeft className="h-3 w-3" />
            All users
          </Link>
        }
        title="Invite user"
        subtitle="They'll receive an email with a link to join your workspace."
      />

      <form onSubmit={submit} className="flex flex-col gap-6 overflow-y-auto px-8 py-6">
        <SettingsCard title="Recipient" description="Who's joining the workspace?">
          <InputField
            label="Email"
            type="email"
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error || undefined}
            autoFocus
            required
          />
        </SettingsCard>

        <SettingsCard title="Role" description="Members can use the workspace; admins can manage it.">
          <FieldStack label="Role">
            <div role="tablist" className="flex overflow-hidden rounded-md border border-wm-border">
              {(['member', 'admin'] as const).map((r, i) => {
                const active = role === r
                return (
                  <button
                    key={r}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setRole(r)}
                    className={
                      'flex-1 cursor-pointer px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[1.5px] transition-colors ' +
                      (active
                        ? 'bg-wm-accent text-wm-text-on-accent'
                        : 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary') +
                      (i > 0 ? ' border-l border-wm-border' : '')
                    }
                  >
                    {r}
                  </button>
                )
              })}
            </div>
          </FieldStack>
        </SettingsCard>

        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            type="button"
            onClick={() => router.push('/admin/users')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            icon={<Send className="h-3.5 w-3.5" />}
            loading={sending}
          >
            Send invite
          </Button>
        </div>
      </form>
    </div>
  )
}
