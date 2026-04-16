'use client'

import { useState, useEffect } from 'react'
import { Users, UserPlus, Trash2, X, Search, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { InputField } from '@/components/ui/input-field'
import { StatCard } from '@/components/ui/stat-card'
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
  status?: string
}

type PanelMode = 'none' | 'create' | 'detail'

export default function UserManagementPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [panelMode, setPanelMode] = useState<PanelMode>('none')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  // Create user form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [externalEmail, setExternalEmail] = useState('')
  const [newEmailLocal, setNewEmailLocal] = useState('')
  const [domain, setDomain] = useState('')

  useEffect(() => {
    api.get<{ data: Member[] }>('/api/v1/admin/members').then((res) => {
      setMembers(res.data)
    }).catch(() => {})
    api.get<{ data: Array<{ name: string }> }>('/api/v1/setup/domains').then((res) => {
      if (res.data.length > 0) setDomain(res.data[0].name)
    }).catch(() => {})
  }, [])

  // Auto-compose email from first.last
  useEffect(() => {
    const first = firstName.toLowerCase().replace(/[^a-z0-9]/g, '')
    const last = lastName.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (first && last) {
      setNewEmailLocal(`${first}.${last}`)
    } else if (first) {
      setNewEmailLocal(first)
    }
  }, [firstName, lastName])

  const totalUsers = members.length
  const activeUsers = members.filter((m) => m.status !== 'suspended').length
  const pendingUsers = members.filter((m) => m.status === 'pending').length

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  function openCreate() {
    setFirstName('')
    setLastName('')
    setExternalEmail('')
    setNewEmailLocal('')
    setCreateError('')
    setCreateSuccess('')
    setSelectedMember(null)
    setPanelMode('create')
  }

  function openDetail(member: Member) {
    setSelectedMember(member)
    setPanelMode('detail')
  }

  async function handleCreateUser() {
    if (!firstName.trim() || !newEmailLocal.trim()) {
      setCreateError('First name and email address are required')
      return
    }

    setCreating(true)
    setCreateError('')
    setCreateSuccess('')

    try {
      await api.post('/api/v1/admin/users/create', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        externalEmail: externalEmail.trim() || undefined,
        emailLocal: newEmailLocal.trim(),
        displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      })

      setCreateSuccess(externalEmail ? `User created. Invitation sent to ${externalEmail}` : 'User created successfully')
      setFirstName('')
      setLastName('')
      setExternalEmail('')
      setNewEmailLocal('')

      const res = await api.get<{ data: Member[] }>('/api/v1/admin/members')
      setMembers(res.data)

      setTimeout(() => setCreateSuccess(''), 5000)
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  async function removeMember(memberId: string) {
    try {
      await api.delete(`/api/v1/admin/members/${memberId}`)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
      if (selectedMember?.id === memberId) setPanelMode('none')
    } catch {}
  }

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-wm-border bg-wm-surface px-8 py-4">
          <h1 className="text-lg font-semibold text-wm-text-primary">User Management</h1>
          <div className="flex-1" />
          <Button variant="primary" size="sm" icon={<UserPlus className="h-3.5 w-3.5" />} onClick={openCreate}>
            Create User
          </Button>
        </div>

        <div className="flex flex-col gap-5 p-8">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Total Users" value={totalUsers} />
            <StatCard title="Active" value={activeUsers} />
            <StatCard title="Pending" value={pendingUsers} />
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 border border-wm-border bg-wm-surface px-3 py-2">
            <Search className="h-4 w-4 text-wm-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            />
          </div>

          {/* Table */}
          <div className="border border-wm-border">
            <div className="flex items-center border-b border-wm-border bg-wm-surface px-4 py-2">
              <span className="w-[280px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">USER</span>
              <span className="w-[100px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">ROLE</span>
              <span className="w-[80px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">STATUS</span>
              <span className="flex-1 font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">JOINED</span>
              <span className="w-[60px]" />
            </div>

            {filteredMembers.map((member) => (
              <div
                key={member.id}
                onClick={() => openDetail(member)}
                className="flex cursor-pointer items-center border-b border-wm-border px-4 py-3 last:border-b-0 hover:bg-wm-surface-hover transition-colors"
              >
                <div className="flex w-[280px] items-center gap-3">
                  <Avatar name={member.name} size="md" />
                  <div>
                    <p className="text-sm font-medium text-wm-text-primary">{member.name}</p>
                    <p className="font-mono text-[10px] text-wm-text-muted">{member.email}</p>
                  </div>
                </div>
                <div className="w-[100px]">
                  <Badge variant={member.role === 'owner' ? 'accent' : 'default'}>{member.role}</Badge>
                </div>
                <div className="w-[80px]">
                  <Badge variant="info">Active</Badge>
                </div>
                <div className="flex-1">
                  <span className="font-mono text-xs text-wm-text-muted">{formatRelativeTime(new Date(member.joinedAt))}</span>
                </div>
                <div className="w-[60px] flex justify-end">
                  {member.role !== 'owner' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeMember(member.id) }}
                      className="cursor-pointer text-wm-text-muted hover:text-wm-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {filteredMembers.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Users className="h-8 w-8 text-wm-text-muted" />
                <p className="font-mono text-sm text-wm-text-tertiary">
                  {searchQuery ? 'No users match your search' : 'No users yet'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Panel (Create / Detail) ── */}
      {panelMode !== 'none' && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPanelMode('none')} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-wm-border bg-wm-surface shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
              <h2 className="text-base font-semibold text-wm-text-primary">
                {panelMode === 'create' ? 'Create User' : selectedMember?.name}
              </h2>
              <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ── CREATE MODE ── */}
            {panelMode === 'create' && (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-4">
                    <InputField
                      label="First name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                    />
                    <InputField
                      label="Last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                    />

                    <div>
                      <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">
                        Email address
                      </label>
                      <div className="flex items-center border border-wm-border bg-wm-bg">
                        <input
                          type="text"
                          value={newEmailLocal}
                          onChange={(e) => setNewEmailLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                          placeholder="john.doe"
                          className="flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
                        />
                        <span className="shrink-0 pr-3 font-mono text-sm text-wm-text-muted">@{domain || 'wistfare.com'}</span>
                      </div>
                    </div>

                    <InputField
                      label="External email (optional)"
                      value={externalEmail}
                      onChange={(e) => setExternalEmail(e.target.value)}
                      placeholder="john@gmail.com"
                      hint="If provided, invitation with credentials will be sent here"
                    />

                    {createError && <p className="font-mono text-xs text-wm-error">{createError}</p>}
                    {createSuccess && <p className="font-mono text-xs text-wm-accent">{createSuccess}</p>}
                  </div>
                </div>

                <div className="flex gap-3 border-t border-wm-border px-6 py-4">
                  <Button variant="secondary" size="sm" onClick={() => setPanelMode('none')} className="flex-1">Cancel</Button>
                  <Button variant="primary" size="sm" icon={<UserPlus className="h-3.5 w-3.5" />} loading={creating} onClick={handleCreateUser} className="flex-1">
                    Create User
                  </Button>
                </div>
              </>
            )}

            {/* ── DETAIL MODE ── */}
            {panelMode === 'detail' && selectedMember && (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-5">
                    {/* Status badge */}
                    <div className="flex items-center gap-2">
                      <Badge variant="info">Active</Badge>
                    </div>

                    {/* Info grid */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-mono text-[10px] text-wm-text-muted pt-0.5">Full Name</span>
                        <span className="text-sm text-wm-text-primary">{selectedMember.name}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-mono text-[10px] text-wm-text-muted pt-0.5">Email</span>
                        <span className="font-mono text-xs text-wm-text-secondary">{selectedMember.email}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-mono text-[10px] text-wm-text-muted pt-0.5">Role</span>
                        <Badge variant={selectedMember.role === 'owner' ? 'accent' : 'default'}>{selectedMember.role}</Badge>
                      </div>
                    </div>

                    {/* Admin notice */}
                    {(selectedMember.role === 'owner' || selectedMember.role === 'admin') && (
                      <div className="flex items-start gap-2 border border-wm-accent/20 bg-wm-accent/5 p-3">
                        <Shield className="mt-0.5 h-4 w-4 text-wm-accent" />
                        <div>
                          <p className="text-xs font-medium text-wm-accent">Admin</p>
                          <p className="font-mono text-[10px] text-wm-text-muted">Full access to all settings and user management.</p>
                        </div>
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex flex-col gap-3 border-t border-wm-border pt-4">
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-mono text-[10px] text-wm-text-muted pt-0.5">Last Login</span>
                        <span className="font-mono text-xs text-wm-text-secondary">{formatRelativeTime(new Date(selectedMember.joinedAt))}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-mono text-[10px] text-wm-text-muted pt-0.5">Joined</span>
                        <span className="font-mono text-xs text-wm-text-secondary">{new Date(selectedMember.joinedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 border-t border-wm-border px-6 py-4">
                  <Button variant="secondary" size="sm">Reset Password</Button>
                  {selectedMember.role !== 'owner' && (
                    <>
                      <Button variant="secondary" size="sm">Suspend Account</Button>
                      <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => removeMember(selectedMember.id)}>
                        Delete Account
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
