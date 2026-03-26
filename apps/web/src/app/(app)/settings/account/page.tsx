'use client'

import { useState, useEffect } from 'react'
import { User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { SettingsCard } from '@/components/ui/settings-card'
import { api } from '@/lib/api-client'

export default function AccountSettingsPage() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    api.get<{ user: { name: string; email: string } | null }>('/api/v1/auth/session').then((res) => {
      if (res.user) {
        setUser(res.user)
        setName(res.user.name)
      }
    })
  }, [])

  return (
    <div className="flex max-w-2xl flex-col gap-6">
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
          <div className="flex justify-end">
            <Button variant="primary" size="sm">
              Save Changes
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Password" description="Update your password.">
        <div className="flex flex-col gap-4">
          <InputField label="Current password" type="password" placeholder="Enter current password" />
          <InputField label="New password" type="password" placeholder="Enter new password" />
          <InputField label="Confirm password" type="password" placeholder="Confirm new password" />
          <div className="flex justify-end">
            <Button variant="primary" size="sm">
              Update Password
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Danger Zone" description="Irreversible actions for your account.">
        <Button variant="danger" size="sm">
          Delete Account
        </Button>
      </SettingsCard>
    </div>
  )
}
