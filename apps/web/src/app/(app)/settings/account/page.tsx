'use client'

import { useEffect, useState } from 'react'
import { Lock, Save, User as UserIcon } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import {
  Avatar,
  Button,
  Card,
  InputField,
  SettingsCard,
} from '@/components/ui'
import { api } from '@/lib/api-client'

/**
 * `/settings/account` — Pencil reference: `SettingsV3-Account` (`QWQRT`).
 *
 * V3 chrome:
 *   PageHeader  Settings · Account
 *   ─────────────────────────────────
 *   PROFILE card  (avatar + display name + email — change link)
 *   STORAGE card  (placeholder until /api/v1/user/storage ships)
 *   PASSWORD card (current + new + confirm)
 *   DANGER zone
 */
export default function AccountSettingsPage() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  useEffect(() => {
    api
      .get<{ user: { name: string; email: string } }>('/api/v1/user/profile')
      .then((res) => {
        setUser(res.user)
        setName(res.user.name)
      })
      .catch(() => undefined)
  }, [])

  async function handleSaveProfile() {
    setSaving(true)
    setSaveSuccess(false)
    try {
      await api.patch('/api/v1/user/profile', { name })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      // Silent — error UI surfaces inline if we wire it later.
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    setPasswordError('')
    setPasswordSuccess(false)
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    setPasswordSaving(true)
    try {
      await api.post('/api/v1/user/change-password', {
        currentPassword,
        newPassword,
      })
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Settings"
        title="Account"
        subtitle={user?.email ?? undefined}
      />
      <div className="flex flex-col gap-6 overflow-y-auto px-8 py-6">
        {/* Pencil PROFILE card — large avatar + name + email row. */}
        <SettingsCard title="Profile" description="Manage your account information.">
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-4">
              <Avatar
                name={user?.name ?? '—'}
                size="lg"
                className="h-14 w-14 text-base"
              />
              <div className="flex flex-col gap-0.5">
                <p className="font-sans text-base font-semibold text-wm-text-primary">
                  {user?.name ?? '…'}
                </p>
                <p className="font-mono text-[11px] text-wm-text-tertiary">
                  {user?.email ?? '…'}
                </p>
              </div>
            </div>
            <InputField
              label="Full name"
              icon={<UserIcon className="h-[18px] w-[18px]" />}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <InputField
              label="Email"
              value={user?.email || ''}
              hint="Email change requires admin approval — coming soon."
              disabled
            />
            <div className="flex items-center justify-end gap-3">
              {saveSuccess && (
                <span className="font-mono text-xs text-wm-accent">Saved!</span>
              )}
              <Button
                size="sm"
                icon={<Save className="h-3.5 w-3.5" />}
                loading={saving}
                onClick={handleSaveProfile}
              >
                Save changes
              </Button>
            </div>
          </div>
        </SettingsCard>

        {/* Storage card — placeholder. The V3 design shows a 4-stat strip
            and an "in-flight quota" lime button. We surface the shape
            here so the visual is correct; the numbers go live when the
            backend `/user/storage` endpoint ships. */}
        <SettingsCard
          title="Storage"
          description="Per-user quota across mail, attachments, drafts, and trash."
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="font-mono text-[28px] font-bold text-wm-text-primary">
                — of 5 GB
              </span>
              <Button variant="secondary" size="sm" disabled>
                Request increase
              </Button>
            </div>
            <div className="h-1.5 w-full overflow-hidden bg-wm-bg">
              <div className="h-full w-0 bg-wm-accent transition-all" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Mail', placeholder: '— GB' },
                { label: 'Attachments', placeholder: '— MB' },
                { label: 'Drafts', placeholder: '— MB' },
                { label: 'Trash', placeholder: '— MB' },
              ].map((stat) => (
                <Card key={stat.label} className="text-center">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[1px] text-wm-text-muted">
                    {stat.label}
                  </p>
                  <p className="mt-1 font-mono text-base font-bold text-wm-text-primary">
                    {stat.placeholder}
                  </p>
                </Card>
              ))}
            </div>
            <p className="font-mono text-[10px] text-wm-text-muted">
              Live numbers ship with the upcoming <code>/api/v1/user/storage</code> endpoint.
            </p>
          </div>
        </SettingsCard>

        <SettingsCard title="Password" description="Update your password.">
          <div className="flex flex-col gap-4">
            <InputField
              label="Current password"
              type="password"
              placeholder="Enter current password"
              icon={<Lock className="h-[18px] w-[18px]" />}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <InputField
              label="New password"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <InputField
              label="Confirm password"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={passwordError}
            />
            <div className="flex items-center justify-end gap-3">
              {passwordSuccess && (
                <span className="font-mono text-xs text-wm-accent">
                  Password updated!
                </span>
              )}
              <Button
                size="sm"
                icon={<Lock className="h-3.5 w-3.5" />}
                loading={passwordSaving}
                onClick={handleChangePassword}
              >
                Update password
              </Button>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Danger zone"
          description="Permanently delete your account and all of its data."
        >
          <Button variant="danger" size="sm">
            Delete account
          </Button>
        </SettingsCard>
      </div>
    </div>
  )
}
