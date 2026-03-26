'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Filter, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { formatRelativeTime } from '@/lib/utils'

type Member = {
  id: string
  userId: string
  role: string
  name: string
  email: string
  avatarUrl: string | null
  joinedAt: string
}

export default function AdminUsersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [createForm, setCreateForm] = useState({ firstName: '', lastName: '', email: '', displayName: '', role: 'member', storageQuota: 5 })
  const [creating] = useState(false)

  const fetchMembers = useCallback(async () => {
    try {
      const res = await api.get<{ data: Member[] }>('/api/v1/admin/members')
      setMembers(res.data)
    } catch {}
  }, [])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const stats = {
    total: members.length,
    active: members.filter((m) => m.role !== 'suspended').length,
    inactive: 0,
    suspended: 0,
  }

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-wm-border bg-wm-surface px-8 py-4">
          <h1 className="text-lg font-semibold text-wm-text-primary">User Management</h1>
          <span className="font-mono text-xs text-wm-text-muted">{stats.total} users</span>
          <div className="flex-1" />
          <div className="flex items-center gap-2 border border-wm-border bg-wm-bg px-3 py-2">
            <Search className="h-4 w-4 text-wm-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            />
          </div>
          <button className="flex items-center gap-1 border border-wm-border px-3 py-2 font-mono text-xs text-wm-text-secondary hover:bg-wm-surface-hover">
            <Filter className="h-3.5 w-3.5" />
            Filter
          </button>
        </div>

        {/* Stats row */}
        <div className="flex gap-0 border-b border-wm-border">
          {[
            { label: 'Total Users', value: stats.total },
            { label: 'Active', value: stats.active },
            { label: 'Inactive', value: stats.inactive },
            { label: 'Suspended', value: stats.suspended },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-1 flex-col border-r border-wm-border px-8 py-5 last:border-r-0">
              <span className="font-mono text-2xl font-bold text-wm-text-primary">{stat.value}</span>
              <span className="font-mono text-[10px] text-wm-text-muted">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-8 py-4">
          {/* Table header */}
          <div className="flex items-center border-b border-wm-border px-4 py-2 font-mono text-[10px] font-semibold text-wm-text-muted">
            <span className="w-64">User</span>
            <span className="w-24">Role</span>
            <span className="w-24">Status</span>
            <span className="flex-1">Domain</span>
            <span className="w-24 text-right">Created</span>
          </div>

          {/* Table rows */}
          {filtered.map((member) => (
            <div
              key={member.id}
              className="flex items-center border-b border-wm-border px-4 py-3 transition-colors hover:bg-wm-surface-hover"
            >
              <div className="flex w-64 items-center gap-3">
                <Avatar name={member.name} size="md" />
                <div>
                  <p className="text-sm font-medium text-wm-text-primary">{member.name}</p>
                  <p className="font-mono text-[10px] text-wm-text-muted">{member.email}</p>
                </div>
              </div>
              <div className="w-24">
                <Badge
                  variant={
                    member.role === 'owner' ? 'accent' : member.role === 'admin' ? 'info' : 'default'
                  }
                  size="sm"
                >
                  {member.role}
                </Badge>
              </div>
              <div className="w-24">
                <Badge variant="accent" size="sm">Active</Badge>
              </div>
              <div className="flex-1">
                <span className="font-mono text-xs text-wm-text-secondary">
                  {member.email.split('@')[1]}
                </span>
              </div>
              <span className="w-24 text-right font-mono text-xs text-wm-text-muted">
                {formatRelativeTime(new Date(member.joinedAt))}
              </span>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <p className="font-mono text-sm text-wm-text-muted">No users found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create User slide-in panel */}
      {showCreatePanel && (
        <div className="flex w-[360px] shrink-0 flex-col border-l border-wm-border bg-wm-bg">
          <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
            <h2 className="text-base font-semibold text-wm-text-primary">Create User</h2>
            <button onClick={() => setShowCreatePanel(false)} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
            {/* Profile photo placeholder */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center border border-wm-border bg-wm-surface">
                <UserPlus className="h-6 w-6 text-wm-text-muted" />
              </div>
              <span className="font-mono text-[10px] text-wm-text-muted">Profile photo</span>
            </div>

            <div className="flex gap-3">
              <InputField
                label="First name"
                placeholder="John"
                value={createForm.firstName}
                onChange={(e) => setCreateForm((f) => ({ ...f, firstName: e.target.value }))}
                className="flex-1"
              />
              <InputField
                label="Last name"
                placeholder="Doe"
                value={createForm.lastName}
                onChange={(e) => setCreateForm((f) => ({ ...f, lastName: e.target.value }))}
                className="flex-1"
              />
            </div>

            <InputField
              label="Email address"
              placeholder="john.doe@wistfare.com"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
            />

            <InputField
              label="Display name"
              placeholder="John Doe"
              value={createForm.displayName}
              onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
            />

            {/* Role selector */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-sm font-medium text-wm-text-secondary">Role</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                className="border border-wm-border bg-wm-surface px-4 py-3 font-mono text-sm text-wm-text-primary outline-none focus:border-wm-accent"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {/* Storage quota slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="font-mono text-sm font-medium text-wm-text-secondary">Storage quota</label>
                <span className="font-mono text-xs text-wm-accent">{createForm.storageQuota} GB</span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                value={createForm.storageQuota}
                onChange={(e) => setCreateForm((f) => ({ ...f, storageQuota: parseInt(e.target.value) }))}
                className="accent-wm-accent"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-wm-border px-6 py-4">
            <Button variant="ghost" onClick={() => setShowCreatePanel(false)}>Cancel</Button>
            <Button variant="primary" loading={creating} icon={<UserPlus className="h-4 w-4" />}>
              Create User
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
