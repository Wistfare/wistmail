'use client'

import { useState, useEffect } from 'react'
import { Users, UserPlus, Trash2, X, Search } from 'lucide-react'
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

export default function UserManagementPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createSuccess, setCreateSuccess] = useState('')

  // Create user form
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [externalEmail, setExternalEmail] = useState('')
  const [newEmailLocal, setNewEmailLocal] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [domain, setDomain] = useState('')

  useEffect(() => {
    api.get<{ data: Member[] }>('/api/v1/admin/members').then((res) => {
      setMembers(res.data)
    }).catch(() => {})

    // Get domain for new email addresses
    api.get<{ data: Array<{ name: string }> }>('/api/v1/setup/domains').then((res) => {
      if (res.data.length > 0) setDomain(res.data[0].name)
    }).catch(() => {})
  }, [])

  // Auto-fill display name from first + last name
  useEffect(() => {
    if (firstName || lastName) {
      setDisplayName(`${firstName} ${lastName}`.trim())
    }
  }, [firstName, lastName])

  // Auto-fill email local part from first name
  useEffect(() => {
    if (firstName && !newEmailLocal) {
      setNewEmailLocal(firstName.toLowerCase().replace(/[^a-z0-9]/g, ''))
    }
  }, [firstName, newEmailLocal])

  const totalUsers = members.length
  const activeUsers = members.filter((m) => m.status !== 'suspended' && m.status !== 'inactive').length
  const pendingUsers = members.filter((m) => m.status === 'pending').length

  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  async function handleCreateUser() {
    if (!firstName.trim() || !newEmailLocal.trim() || !externalEmail.trim()) {
      setCreateError('First name, email address, and external email are required')
      return
    }

    setCreating(true)
    setCreateError('')
    setCreateSuccess('')

    try {
      await api.post('/api/v1/admin/users/create', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        externalEmail: externalEmail.trim(),
        emailLocal: newEmailLocal.trim(),
        displayName: displayName.trim() || `${firstName} ${lastName}`.trim(),
      })

      setCreateSuccess(`User created. Invitation sent to ${externalEmail}`)

      // Reset form
      setFirstName('')
      setLastName('')
      setExternalEmail('')
      setNewEmailLocal('')
      setDisplayName('')

      // Refresh member list
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
    } catch {}
  }

  return (
    <div className="flex gap-6 p-8">
      {/* Main content */}
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-wm-text-primary">User Management</h1>
          <div className="flex-1" />
          <Button
            variant="primary"
            size="sm"
            icon={<UserPlus className="h-4 w-4" />}
            onClick={() => setShowCreatePanel(!showCreatePanel)}
          >
            Create User
          </Button>
        </div>

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

        {/* User table */}
        <div className="border border-wm-border">
          {/* Header */}
          <div className="flex items-center border-b border-wm-border bg-wm-surface px-4 py-2">
            <span className="w-[280px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">USER</span>
            <span className="w-[100px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">ROLE</span>
            <span className="w-[80px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">STATUS</span>
            <span className="flex-1 font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">JOINED</span>
            <span className="w-[60px]" />
          </div>

          {/* Rows */}
          {filteredMembers.map((member) => (
            <div key={member.id} className="flex items-center border-b border-wm-border px-4 py-3 last:border-b-0 hover:bg-wm-surface-hover transition-colors">
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
                <span className="font-mono text-xs text-wm-text-muted">
                  {formatRelativeTime(new Date(member.joinedAt))}
                </span>
              </div>
              <div className="w-[60px] flex justify-end">
                {member.role !== 'owner' && (
                  <button
                    onClick={() => removeMember(member.id)}
                    className="cursor-pointer text-wm-text-muted hover:text-wm-error"
                    title="Remove user"
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

      {/* Create User Panel — floating overlay */}
      {showCreatePanel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowCreatePanel(false)} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col border-l border-wm-border bg-wm-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
              <h2 className="text-lg font-semibold text-wm-text-primary">Create User</h2>
              <button onClick={() => setShowCreatePanel(false)} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Profile photo placeholder */}
              <div className="mb-6 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-wm-surface-hover">
                  <Users className="h-6 w-6 text-wm-text-muted" />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex gap-3">
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
                </div>

                <InputField
                  label="External email (for invitation)"
                  value={externalEmail}
                  onChange={(e) => setExternalEmail(e.target.value)}
                  placeholder="john@gmail.com"
                  hint="Invitation with login credentials will be sent here"
                />

                <div>
                  <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">
                    Email address
                  </label>
                  <div className="flex items-center border border-wm-border bg-wm-bg px-3 py-2">
                    <input
                      type="text"
                      value={newEmailLocal}
                      onChange={(e) => setNewEmailLocal(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                      placeholder="john.doe"
                      className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
                    />
                    <span className="font-mono text-sm text-wm-text-muted">@{domain || 'wistfare.com'}</span>
                  </div>
                </div>

                <InputField
                  label="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="John Doe"
                />

                {createError && (
                  <p className="font-mono text-xs text-wm-error">{createError}</p>
                )}
                {createSuccess && (
                  <p className="font-mono text-xs text-wm-accent">{createSuccess}</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 border-t border-wm-border px-6 py-4">
              <Button variant="secondary" size="sm" onClick={() => setShowCreatePanel(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<UserPlus className="h-3.5 w-3.5" />}
                loading={creating}
                onClick={handleCreateUser}
                className="flex-1"
              >
                Create User
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
