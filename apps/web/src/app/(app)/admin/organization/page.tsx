'use client'

import { useState, useEffect, useCallback } from 'react'
import { Building2, Pencil, Globe, AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'

type Organization = { id: string; name: string; slug: string; logoUrl: string | null; createdAt: string }
type Domain = { id: string; name: string; verified: boolean; status: string }

export default function AdminOrganizationPage() {
  const [org, setOrg] = useState<Organization | null>(null)
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)

  // Edit form
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  // Create form (if no org)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const orgRes = await api.get<{ organization: Organization | null }>('/api/v1/admin/organization')
      if (orgRes.organization) {
        setOrg(orgRes.organization)
        setEditName(orgRes.organization.name)
        setEditSlug(orgRes.organization.slug)
      }
      const domRes = await api.get<{ data: Domain[] }>('/api/v1/setup/domains')
      setDomains(domRes.data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      const result = await api.post<Organization>('/api/v1/admin/organization', { name: createName })
      setOrg(result)
      setEditName(result.name)
      setEditSlug(result.slug)
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  async function handleSave() {
    if (!org) return
    setSaving(true)
    setSaveError('')
    setSaveSuccess('')
    try {
      await api.patch(`/api/v1/admin/organization/${org.id}`, { name: editName })
      setOrg({ ...org, name: editName })
      setSaveSuccess('Organization updated')
      setTimeout(() => setSaveSuccess(''), 3000)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

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
          <form onSubmit={handleCreate} className="flex w-full max-w-md flex-col gap-5 border border-wm-border bg-wm-surface p-8">
            <Building2 className="h-8 w-8 text-wm-accent" />
            <h2 className="text-xl font-semibold text-wm-text-primary">Create Organization</h2>
            <p className="font-mono text-xs text-wm-text-tertiary">
              Set up your organization to manage team members, domains, and email infrastructure.
            </p>
            <InputField label="Organization name" placeholder="Acme Inc." value={createName} onChange={(e) => setCreateName(e.target.value)} error={createError} />
            <Button type="submit" variant="primary" loading={creating}>Create Organization</Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {header}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="flex flex-col gap-6">
            {/* Organization Details */}
            <div className="border border-wm-border bg-wm-surface p-6">
              <div className="flex items-center gap-2 mb-5">
                <Building2 className="h-4 w-4 text-wm-accent" />
                <h3 className="text-sm font-semibold text-wm-text-primary">Organization Details</h3>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" icon={<Pencil className="h-3 w-3" />} onClick={() => setShowEdit(true)}>Edit</Button>
              </div>

              <div className="grid grid-cols-2 gap-y-4 gap-x-8">
                <div>
                  <p className="font-mono text-[10px] text-wm-text-muted">Name</p>
                  <p className="mt-1 text-sm text-wm-text-primary">{org.name}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] text-wm-text-muted">Slug</p>
                  <p className="mt-1 font-mono text-sm text-wm-text-secondary">{org.slug}</p>
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

            {/* Domains */}
            <div className="border border-wm-border bg-wm-surface p-6">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-4 w-4 text-wm-accent" />
                <h3 className="text-sm font-semibold text-wm-text-primary">Domains</h3>
                <div className="flex-1" />
                <Badge variant={domains.length > 0 ? 'accent' : 'default'} size="sm">{domains.length} active</Badge>
              </div>
              {domains.map((domain) => (
                <div key={domain.id} className="flex items-center gap-3 bg-wm-bg px-4 py-3 mb-1">
                  <span className="font-mono text-sm text-wm-text-primary">{domain.name}</span>
                  <div className="flex-1" />
                  <Badge variant={domain.verified ? 'accent' : 'warning'} size="sm">{domain.verified ? 'Verified' : 'Pending'}</Badge>
                </div>
              ))}
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

      {/* Edit Organization Panel */}
      {showEdit && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowEdit(false)} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-wm-border bg-wm-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
              <h2 className="text-base font-semibold text-wm-text-primary">Edit Organization</h2>
              <button onClick={() => setShowEdit(false)} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-col gap-4">
                <InputField
                  label="Organization name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Wistfare Inc."
                />
                <InputField
                  label="Slug"
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  placeholder="wistfare"
                  hint="Used in URLs and identifiers"
                />
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">Plan</label>
                  <div className="flex items-center gap-2 border border-wm-border bg-wm-bg px-3 py-2.5">
                    <Badge variant="accent" size="sm">Pro</Badge>
                    <span className="font-mono text-xs text-wm-text-muted">— current plan</span>
                  </div>
                </div>

                {saveError && <p className="font-mono text-xs text-wm-error">{saveError}</p>}
                {saveSuccess && <p className="font-mono text-xs text-wm-accent">{saveSuccess}</p>}
              </div>
            </div>

            <div className="flex gap-3 border-t border-wm-border px-6 py-4">
              <Button variant="secondary" size="sm" onClick={() => setShowEdit(false)} className="flex-1">Cancel</Button>
              <Button variant="primary" size="sm" loading={saving} onClick={handleSave} className="flex-1">Save</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
