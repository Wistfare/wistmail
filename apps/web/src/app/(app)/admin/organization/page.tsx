'use client'

import { useState, useEffect } from 'react'
import { Building2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { SettingsCard } from '@/components/ui/settings-card'
import { api } from '@/lib/api-client'

type Organization = { id: string; name: string; slug: string; logoUrl: string | null }

export default function OrganizationPage() {
  const [org, setOrg] = useState<Organization | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ organization: Organization | null }>('/api/v1/admin/organization').then((res) => {
      if (res.organization) {
        setOrg(res.organization)
        setName(res.organization.name)
      }
    })
  }, [])

  async function createOrg(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      const result = await api.post<Organization>('/api/v1/admin/organization', { name })
      setOrg(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  async function updateOrg() {
    if (!org) return
    setLoading(true)
    try {
      await api.patch(`/api/v1/admin/organization/${org.id}`, { name })
    } catch {} finally {
      setLoading(false)
    }
  }

  if (!org) {
    return (
      <div className="flex max-w-lg flex-col gap-6">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Organization</h1>
        <SettingsCard title="Create Organization" description="Set up your organization to manage team members and settings.">
          <form onSubmit={createOrg} className="flex flex-col gap-4">
            <InputField
              label="Organization name"
              icon={<Building2 className="h-[18px] w-[18px]" />}
              placeholder="Acme Inc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={error}
            />
            <Button type="submit" variant="primary" loading={creating}>
              Create Organization
            </Button>
          </form>
        </SettingsCard>
      </div>
    )
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold text-wm-text-primary">Organization</h1>

      <SettingsCard title="General" description="Manage your organization settings.">
        <div className="flex flex-col gap-4">
          <InputField
            label="Organization name"
            icon={<Building2 className="h-[18px] w-[18px]" />}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <InputField label="Slug" value={org.slug} disabled />
          <div className="flex justify-end">
            <Button variant="primary" size="sm" icon={<Save className="h-3.5 w-3.5" />} loading={loading} onClick={updateOrg}>
              Save
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Danger Zone" description="Irreversible actions.">
        <Button variant="danger" size="sm">
          Delete Organization
        </Button>
      </SettingsCard>
    </div>
  )
}
