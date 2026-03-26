'use client'

import { useState } from 'react'
import { Shield, Crown, UserCog, User, Plus, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const ALL_PERMISSIONS = [
  { id: 'emails:send', label: 'emails:send' },
  { id: 'emails:read', label: 'emails:read' },
  { id: 'domains:manage', label: 'domains:manage' },
  { id: 'templates:manage', label: 'templates:manage' },
  { id: 'api-keys:manage', label: 'api-keys:manage' },
  { id: 'webhooks:manage', label: 'webhooks:manage' },
  { id: 'contacts:manage', label: 'contacts:manage' },
  { id: 'analytics:read', label: 'analytics:read' },
  { id: 'users:manage', label: 'users:manage' },
  { id: 'roles:manage', label: 'roles:manage' },
  { id: 'org:manage', label: 'org:manage' },
  { id: 'audit:read', label: 'audit:read' },
]

const DEFAULT_ROLES = [
  {
    id: 'owner',
    name: 'Owner',
    icon: Crown,
    description: 'Full access to everything. Cannot be deleted or modified.',
    permissions: ALL_PERMISSIONS.map((p) => p.id),
    members: 1,
    color: 'accent' as const,
  },
  {
    id: 'admin',
    name: 'Admin',
    icon: UserCog,
    description: 'Manage users, domains, API keys, and organization settings.',
    permissions: ['emails:send', 'emails:read', 'domains:manage', 'templates:manage', 'api-keys:manage', 'webhooks:manage', 'contacts:manage', 'analytics:read'],
    members: 0,
    color: 'info' as const,
  },
  {
    id: 'member',
    name: 'Member',
    icon: User,
    description: 'Basic access. Create and send emails, use templates.',
    permissions: ['emails:send', 'emails:read', 'contacts:manage'],
    members: 0,
    color: 'default' as const,
  },
]

export default function AdminRolesPage() {
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [newRole, setNewRole] = useState({ name: '', description: '', permissions: [] as string[] })

  function togglePermission(permId: string) {
    setNewRole((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permId)
        ? prev.permissions.filter((p) => p !== permId)
        : [...prev.permissions, permId],
    }))
  }

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-4 border-b border-wm-border bg-wm-surface px-8 py-4">
          <h1 className="text-lg font-semibold text-wm-text-primary">Roles & Permissions</h1>
          <div className="flex-1" />
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreatePanel(true)}
          >
            Create Role
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <p className="mb-6 font-mono text-xs text-wm-text-tertiary">
            Define roles and assign granular permissions to control what each team member can access and manage.
          </p>

          <div className="flex flex-col gap-4">
            {DEFAULT_ROLES.map((role) => {
              const Icon = role.icon
              return (
                <div key={role.id} className="border border-wm-border bg-wm-surface p-5">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center',
                      role.color === 'accent' ? 'bg-wm-accent/15' : role.color === 'info' ? 'bg-wm-info/15' : 'bg-wm-surface-hover',
                    )}>
                      <Icon className={cn(
                        'h-5 w-5',
                        role.color === 'accent' ? 'text-wm-accent' : role.color === 'info' ? 'text-wm-info' : 'text-wm-text-muted',
                      )} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-wm-text-primary">{role.name}</h3>
                        <Badge variant={role.color} size="sm">{role.id}</Badge>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-wm-text-muted">{role.description}</p>

                      {/* Permission badges */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {role.permissions.map((perm) => (
                          <span
                            key={perm}
                            className="bg-wm-bg px-2 py-0.5 font-mono text-[9px] text-wm-text-tertiary"
                          >
                            {perm}
                          </span>
                        ))}
                      </div>

                      <p className="mt-3 font-mono text-[10px] text-wm-text-muted">
                        {role.members} member{role.members !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Create Role slide-in panel */}
      {showCreatePanel && (
        <div className="flex w-[360px] shrink-0 flex-col border-l border-wm-border bg-wm-bg">
          <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
            <h2 className="text-base font-semibold text-wm-text-primary">Create Role</h2>
            <button onClick={() => setShowCreatePanel(false)} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
            <InputField
              label="Role name"
              placeholder="e.g., Editor"
              value={newRole.name}
              onChange={(e) => setNewRole((r) => ({ ...r, name: e.target.value }))}
            />

            <InputField
              label="Description"
              placeholder="What can this role do?"
              value={newRole.description}
              onChange={(e) => setNewRole((r) => ({ ...r, description: e.target.value }))}
            />

            {/* Permissions checklist */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-sm font-medium text-wm-text-secondary">Permissions</label>
              <div className="flex flex-col gap-1">
                {ALL_PERMISSIONS.map((perm) => {
                  const checked = newRole.permissions.includes(perm.id)
                  return (
                    <button
                      key={perm.id}
                      onClick={() => togglePermission(perm.id)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors',
                        checked ? 'bg-wm-accent/10' : 'hover:bg-wm-surface-hover',
                      )}
                    >
                      <div className={cn(
                        'flex h-4 w-4 items-center justify-center border',
                        checked ? 'border-wm-accent bg-wm-accent' : 'border-wm-border',
                      )}>
                        {checked && <Check className="h-2.5 w-2.5 text-wm-text-on-accent" />}
                      </div>
                      <span className="font-mono text-xs text-wm-text-secondary">{perm.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-wm-border px-6 py-4">
            <Button variant="ghost" onClick={() => setShowCreatePanel(false)}>Cancel</Button>
            <Button variant="primary" icon={<Shield className="h-4 w-4" />}>Create Role</Button>
          </div>
        </div>
      )}
    </div>
  )
}
