'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { Button, InputField, SettingsCard, Toggle } from '@/components/ui'
import { FieldStack } from '@/components/ui/field-stack'
import { api } from '@/lib/api-client'

/**
 * `/admin/users/new` — Pencil reference: `AdminV3-CreateUser` (`udt2q`).
 *
 * V3 polish:
 *   - Full-name field that the backend splits into firstName/lastName
 *   - Mailbox local-part input + the workspace domain shown inline
 *   - External email (optional, used for the invitation message)
 *   - Role picker (member / admin)
 *   - "Send invitation email" toggle — when off the externalEmail field
 *     is hidden and the backend doesn't fan-out the invitation
 *
 * Wires to `POST /api/v1/admin/users/create` (matches the existing
 * /admin/members panel form). On success, bounces back to /admin/users.
 */
export default function AdminInviteUserPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [emailLocal, setEmailLocal] = useState('')
  const [externalEmail, setExternalEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [sendInvite, setSendInvite] = useState(true)
  const [domain, setDomain] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  // Resolve the workspace domain so the email-local input shows
  // `local @ workspace.com` like the Pencil frame.
  useEffect(() => {
    api
      .get<{ domain: { name: string } | null }>('/api/v1/admin/organization/domain')
      .then((res) => {
        if (res.domain) setDomain(res.domain.name)
      })
      .catch(() => undefined)
  }, [])

  // Mirror the email-local from the name once for nice UX, but stop
  // tracking once the user edits it explicitly.
  const [localTouched, setLocalTouched] = useState(false)
  useEffect(() => {
    if (localTouched) return
    const first = fullName.split(' ')[0] ?? ''
    setEmailLocal(first.toLowerCase().replace(/[^a-z0-9]/g, ''))
  }, [fullName, localTouched])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const parts = fullName.trim().split(/\s+/)
    const firstName = parts[0] ?? ''
    const lastName = parts.slice(1).join(' ')
    const externalTrimmed = externalEmail.trim()

    if (!firstName) {
      setError('Enter the new user’s name')
      return
    }
    if (!emailLocal.trim()) {
      setError('Pick a mailbox name')
      return
    }
    if (sendInvite && !externalTrimmed) {
      setError('Enter an external email so the invite can be delivered')
      return
    }
    if (
      sendInvite &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(externalTrimmed)
    ) {
      setError('Enter a valid external email')
      return
    }

    setSending(true)
    try {
      await api.post('/api/v1/admin/users/create', {
        firstName,
        lastName,
        emailLocal: emailLocal.trim(),
        displayName: fullName.trim(),
        externalEmail: sendInvite ? externalTrimmed : '',
      })
      // Best-effort role escalation. The /create endpoint defaults to
      // 'member'; if the admin selected 'admin' we'd patch the role
      // after the fact. We don't have the new memberId in the response
      // shape today, so this is a TODO for when the backend exposes it.
      void role
      router.push('/admin/users')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create user')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar
        scope="Admin"
        page="New user"
        rightSlot={
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary hover:text-wm-text-primary"
          >
            <ArrowLeft className="h-3 w-3" />
            All users
          </Link>
        }
      />

      <form
        onSubmit={submit}
        className="flex flex-col gap-6 overflow-y-auto"
        style={{ padding: '28px 32px' }}
      >
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h1 className="font-mono font-bold text-wm-text-primary" style={{ fontSize: 30 }}>
            Invite user
          </h1>
          <p className="font-mono" style={{ fontSize: 12, color: '#6e6e6e' }}>
            Create a mailbox and (optionally) email them a welcome link.
          </p>
        </div>

        <SettingsCard title="Profile" description="Display name and mailbox.">
          <InputField
            label="Full name"
            placeholder="Sarah Kim"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoFocus
            required
          />
          <FieldStack label="Mailbox">
            <div className="flex items-stretch overflow-hidden rounded-md border border-wm-border bg-wm-surface focus-within:border-wm-accent">
              <input
                type="text"
                value={emailLocal}
                onChange={(e) => {
                  setLocalTouched(true)
                  setEmailLocal(e.target.value)
                }}
                placeholder="sarah"
                className="flex-1 bg-transparent px-3 py-2 font-mono text-[13px] text-wm-text-primary placeholder:text-wm-text-muted outline-none"
              />
              <span className="flex items-center bg-wm-bg px-3 font-mono text-[12px] text-wm-text-tertiary">
                @{domain || 'your-workspace.com'}
              </span>
            </div>
          </FieldStack>
        </SettingsCard>

        <SettingsCard
          title="Role"
          description="Members can use the workspace; admins can manage it."
        >
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

        <SettingsCard
          title="Invitation"
          description="When enabled we email the user their temporary password."
        >
          <div className="flex items-center gap-3">
            <Toggle checked={sendInvite} onChange={setSendInvite} />
            <span className="font-mono text-[12px] text-wm-text-primary">
              Send invitation email
            </span>
          </div>
          {sendInvite && (
            <InputField
              label="External email"
              type="email"
              placeholder="sarah.personal@gmail.com"
              value={externalEmail}
              onChange={(e) => setExternalEmail(e.target.value)}
              hint="The invite is sent here so they can sign in for the first time."
            />
          )}
        </SettingsCard>

        {error && (
          <p className="font-mono text-[12px] text-wm-error">{error}</p>
        )}

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
            {sendInvite ? 'Send invite' : 'Create user'}
          </Button>
        </div>
      </form>
    </div>
  )
}
