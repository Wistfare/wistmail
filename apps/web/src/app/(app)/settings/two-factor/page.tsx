'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  KeyRound,
  Mail,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/ui/settings-card'

type Method = {
  id: string
  type: 'totp' | 'email'
  label: string | null
  verified: boolean
  lastUsedAt: string | null
  createdAt: string
}

type MethodsResponse = {
  methods: Method[]
  backupCodes: { total: number; remaining: number }
}

/**
 * `/settings/two-factor` — Pencil reference: `Screen/SettingsV3-2FA`
 * (`EJary` / `dL0cR`).
 *
 * V3 chrome:
 *   - Page heading + lead paragraph
 *   - Top status banner: "Enabled" pill (lime) or "Required" pill
 *     (warning) — always visible.
 *   - "Sign-in methods" SettingsCard, one row per factor:
 *       icon · title · subtitle · status pill · ⋯ row CTA (remove or +)
 *   - Add a method CTA → `/mfa/setup`.
 *   - Danger zone (only when at least one method is verified): "Disable
 *     two-factor" — removes every method.
 */
export default function TwoFactorSettingsPage() {
  const [data, setData] = useState<MethodsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [disabling, setDisabling] = useState(false)

  async function refresh() {
    try {
      const res = await api.get<MethodsResponse>('/api/v1/mfa/methods')
      setData(res)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load methods')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function removeMethod(id: string) {
    if (!confirm('Remove this method? You can add it again later.')) return
    setBusyId(id)
    try {
      await api.delete(`/api/v1/mfa/methods/${id}`)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not remove method')
    } finally {
      setBusyId(null)
    }
  }

  async function regenerateCodes() {
    if (!confirm('Generate new backup codes? Your existing codes will stop working.')) return
    setRegenerating(true)
    try {
      const res = await api.post<{ codes: string[] }>('/api/v1/mfa/backup-codes/regenerate')
      sessionStorage.setItem('wm_fresh_backup_codes', JSON.stringify(res.codes))
      window.location.href = '/mfa/backup-codes'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not regenerate codes')
      setRegenerating(false)
    }
  }

  async function disableTwoFactor() {
    if (!data) return
    const verified = data.methods.filter((m) => m.verified)
    if (verified.length === 0) return
    if (
      !confirm(
        'Disable two-factor authentication entirely? This removes every verified method on your account.',
      )
    ) {
      return
    }
    setDisabling(true)
    try {
      for (const m of verified) {
        await api.delete(`/api/v1/mfa/methods/${m.id}`)
      }
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not disable two-factor')
    } finally {
      setDisabling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Two-factor authentication</h1>
        <p className="font-mono text-xs text-wm-text-muted">Loading…</p>
      </div>
    )
  }

  const methods = data?.methods ?? []
  const verifiedMethods = methods.filter((m) => m.verified)
  const totp = methods.find((m) => m.type === 'totp' && m.verified)
  const email = methods.find((m) => m.type === 'email' && m.verified)
  const backup = data?.backupCodes ?? { total: 0, remaining: 0 }
  const enabled = verifiedMethods.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-wm-text-primary">
          Two-factor authentication
        </h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Adds a second step at sign-in. We strongly recommend keeping at least one method.
        </p>
      </div>

      {error && (
        <div className="border border-wm-error/30 bg-wm-error/10 px-4 py-3">
          <p className="font-mono text-xs text-wm-error">{error}</p>
        </div>
      )}

      {/* V3 status banner — Pencil enabledBar (`dL0cR`):
          full-width row, padding [12, 16], radius 10, fill `wm-accent-dim`,
          1px lime stroke, 14×14 lime ShieldCheck + "Enabled" 12/700 white. */}
      <div
        className="flex items-center gap-3"
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: enabled
            ? 'var(--color-wm-accent-dim)'
            : 'rgba(245, 158, 11, 0.08)',
          border: enabled
            ? '1px solid var(--color-wm-accent)'
            : '1px solid rgba(245, 158, 11, 0.4)',
        }}
      >
        <ShieldCheck
          aria-hidden
          className={enabled ? 'text-wm-accent' : 'text-wm-warning'}
          style={{ width: 16, height: 16 }}
        />
        <span
          className="font-mono font-bold text-wm-text-primary"
          style={{ fontSize: 12 }}
        >
          {enabled ? 'Enabled' : 'Required — add a method'}
        </span>
        {enabled && (
          <span
            className="ml-auto font-mono"
            style={{ fontSize: 11, color: '#6e6e6e' }}
          >
            {verifiedMethods.length} active
          </span>
        )}
      </div>

      <SettingsCard title="Sign-in methods" description="Methods we accept at sign-in.">
        <div className="flex flex-col divide-y divide-wm-border">
          <MethodRow
            icon={<Smartphone className="h-4 w-4" />}
            title="Authenticator app"
            subtitle={
              totp
                ? `Added ${formatDate(totp.createdAt)}${
                    totp.lastUsedAt ? ` • Last used ${formatDate(totp.lastUsedAt)}` : ''
                  }`
                : 'Not set up'
            }
            status={totp ? 'enabled' : 'off'}
            action={
              totp ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  loading={busyId === totp.id}
                  onClick={() => removeMethod(totp.id)}
                >
                  Remove
                </Button>
              ) : (
                <Link href="/mfa/setup/totp">
                  <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
                    Add
                  </Button>
                </Link>
              )
            }
          />
          <MethodRow
            icon={<Mail className="h-4 w-4" />}
            title="Backup email"
            subtitle={
              email
                ? `${email.label ?? 'Email'} • Added ${formatDate(email.createdAt)}`
                : 'Not set up'
            }
            status={email ? 'enabled' : 'off'}
            action={
              email ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  loading={busyId === email.id}
                  onClick={() => removeMethod(email.id)}
                >
                  Remove
                </Button>
              ) : (
                <Link href="/mfa/setup/email">
                  <Button variant="ghost" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
                    Add
                  </Button>
                </Link>
              )
            }
          />
          <MethodRow
            icon={<KeyRound className="h-4 w-4" />}
            title="Backup codes"
            subtitle={
              backup.total > 0
                ? `${backup.remaining} of ${backup.total} remaining`
                : 'Generated automatically when you add your first method'
            }
            status={backup.total > 0 ? 'enabled' : 'off'}
            action={
              backup.total > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCcw className="h-3.5 w-3.5" />}
                  loading={regenerating}
                  onClick={regenerateCodes}
                >
                  Regenerate
                </Button>
              ) : null
            }
          />
        </div>

        <div className="mt-6 flex justify-end">
          <Link href="/mfa/setup">
            <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
              Add a method
            </Button>
          </Link>
        </div>
      </SettingsCard>

      {enabled && (
        <SettingsCard title="Danger zone" description="Removes every verified method.">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-wm-error" />
            <div className="flex flex-1 flex-col gap-3">
              <p className="font-mono text-xs text-wm-text-tertiary">
                Disabling two-factor means your password alone will let anyone into your inbox.
              </p>
              <Button variant="danger" size="sm" loading={disabling} onClick={disableTwoFactor}>
                Disable two-factor
              </Button>
            </div>
          </div>
        </SettingsCard>
      )}
    </div>
  )
}

function MethodRow({
  icon,
  title,
  subtitle,
  status,
  action,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  status: 'enabled' | 'off'
  action: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex h-9 w-9 items-center justify-center bg-wm-accent/10 text-wm-accent">
        {icon}
      </div>
      <div className="flex flex-1 flex-col">
        <p className="text-sm font-medium text-wm-text-primary">{title}</p>
        <p className="font-mono text-[11px] text-wm-text-tertiary">{subtitle}</p>
      </div>
      <StatusPill status={status} />
      {action}
    </div>
  )
}

/// Pencil status pill (`dL0cR.statusEnabled` / `.statusOff`):
///   radius 4, padding [2, 8], 9/700 letterSpacing 1.5
///   enabled → bg `wm-accent-dim`, text `wm-accent`, 1px lime stroke
///   off     → bg transparent, text #6e6e6e, 1px #1a1a1a stroke
function StatusPill({ status }: { status: 'enabled' | 'off' }) {
  const isOn = status === 'enabled'
  return (
    <span
      className="font-mono font-bold uppercase"
      style={{
        fontSize: 9,
        letterSpacing: 1.5,
        padding: '2px 8px',
        borderRadius: 4,
        background: isOn ? 'var(--color-wm-accent-dim)' : 'transparent',
        color: isOn ? 'var(--color-wm-accent)' : '#6e6e6e',
        border: `1px solid ${isOn ? 'var(--color-wm-accent)' : 'var(--color-wm-border)'}`,
      }}
    >
      {isOn ? 'Enabled' : 'Off'}
    </span>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}
