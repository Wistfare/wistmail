'use client'

import { useState, useEffect } from 'react'
import { User, Save, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { SettingsCard } from '@/components/ui/settings-card'
import { api } from '@/lib/api-client'

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
    api.get<{ user: { name: string; email: string } }>('/api/v1/user/profile').then((res) => {
      setUser(res.user)
      setName(res.user.name)
    }).catch(() => {})
  }, [])

  async function handleSaveProfile() {
    setSaving(true)
    setSaveSuccess(false)
    try {
      await api.patch('/api/v1/user/profile', { name })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {} finally {
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-wm-text-primary">Account</h1>

      <SettingsCard title="Profile" description="Manage your account information.">
        <div className="flex flex-col gap-4">
          <InputField
            label="Full name"
            icon={<User className="h-[18px] w-[18px]" />}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <InputField label="Email" value={user?.email || ''} disabled />
          <div className="flex items-center justify-end gap-3">
            {saveSuccess && <span className="font-mono text-xs text-wm-accent">Saved!</span>}
            <Button variant="primary" size="sm" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={handleSaveProfile}>
              Save Changes
            </Button>
          </div>
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
            {passwordSuccess && <span className="font-mono text-xs text-wm-accent">Password updated!</span>}
            <Button variant="primary" size="sm" icon={<Lock className="h-3.5 w-3.5" />} loading={passwordSaving} onClick={handleChangePassword}>
              Update Password
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Danger Zone" description="Irreversible actions for your account.">
        <Button variant="danger" size="sm">Delete Account</Button>
      </SettingsCard>
    </div>
  )
}
