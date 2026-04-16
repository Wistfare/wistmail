'use client'

import { useState, useEffect, useCallback } from 'react'
import { Building2, Pencil, Globe, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'

type Organization = { id: string; name: string; slug: string; logoUrl: string | null; createdAt: string }
type Domain = { id: string; name: string; verified: boolean; status: string }

export default function AdminOrganizationPage() {
  const [org, setOrg] = useState<Organization | null>(null)
  const [domains, setDomains] = useState<Domain[]>([])
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const orgRes = await api.get<{ organization: Organization | null }>('/api/v1/admin/organization')
      if (orgRes.organization) {
        setOrg(orgRes.organization)
        setName(orgRes.organization.name)
      }
      const domRes = await api.get<{ data: Domain[] }>('/api/v1/setup/domains')
      setDomains(domRes.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function createOrg(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      const result = await api.post<Organization>('/api/v1/admin/organization', { name })
      setOrg(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  // Header
  const header = (
    <div className="flex items-center gap-4 border-b border-wm-border bg-wm-surface px-8 py-4">
      <h1 className="text-lg font-semibold text-wm-text-primary">Organization</h1>
    </div>
  )

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin border-2 border-wm-accent border-t-transparent" />
        </div>
      </div>
    )
  }

  if (!org) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center p-8">
          <form onSubmit={createOrg} className="flex w-full max-w-md flex-col gap-5 border border-wm-border bg-wm-surface p-8">
            <Building2 className="h-8 w-8 text-wm-accent" />
            <h2 className="text-xl font-semibold text-wm-text-primary">Create Organization</h2>
            <p className="font-mono text-xs text-wm-text-tertiary">
              Set up your organization to manage team members, domains, and email infrastructure.
            </p>
            <InputField
              label="Organization name"
              placeholder="Acme Inc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={error}
            />
            <Button type="submit" variant="primary" loading={creating}>Create Organization</Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex flex-col gap-6">
          {/* Organization Details card */}
          <div className="border border-wm-border bg-wm-surface p-6">
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="h-4 w-4 text-wm-accent" />
              <h3 className="text-sm font-semibold text-wm-text-primary">Organization Details</h3>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" icon={<Pencil className="h-3 w-3" />}>Edit</Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-mono text-[10px] text-wm-text-muted">Logo</p>
                <div className="mt-1 flex h-10 w-10 items-center justify-center bg-wm-accent">
                  <span className="text-sm font-bold text-wm-text-on-accent">
                    {org.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
              <div>
                <p className="font-mono text-[10px] text-wm-text-muted">Title</p>
                <p className="mt-1 text-sm text-wm-text-primary">{org.name}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-wm-text-muted">Plan</p>
                <Badge variant="accent" size="sm">Pro</Badge>
              </div>
              <div>
                <p className="font-mono text-[10px] text-wm-text-muted">Created</p>
                <p className="mt-1 font-mono text-xs text-wm-text-secondary">
                  {new Date(org.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
          </div>

          {/* Domains card */}
          <div className="border border-wm-border bg-wm-surface p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-4 w-4 text-wm-accent" />
              <h3 className="text-sm font-semibold text-wm-text-primary">Domains</h3>
              <div className="flex-1" />
              <Badge variant={domains.length > 0 ? 'accent' : 'default'} size="sm">
                {domains.length} active
              </Badge>
            </div>

            {domains.length > 0 ? (
              <div className="flex flex-col gap-2">
                {domains.map((domain) => (
                  <div key={domain.id} className="flex items-center gap-3 bg-wm-bg px-4 py-3">
                    <span className="font-mono text-sm text-wm-text-primary">{domain.name}</span>
                    <div className="flex-1" />
                    <Badge variant={domain.verified ? 'accent' : 'warning'} size="sm">
                      {domain.verified ? 'Verified' : 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-mono text-xs text-wm-text-muted">No domains configured yet.</p>
            )}
          </div>

          {/* Danger Zone */}
          <div className="border border-wm-error/30 bg-wm-error/5 p-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-wm-error" />
              <h3 className="text-sm font-semibold text-wm-error">Danger Zone</h3>
            </div>
            <p className="mb-4 font-mono text-xs text-wm-text-muted">
              Deleting the organization will permanently remove all domains, mailboxes, DNS data, and data. This action cannot be undone.
            </p>
            <Button variant="danger" size="sm">Delete Organization</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
