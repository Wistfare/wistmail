'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Pencil, UserMinus, Trash2 } from 'lucide-react'
import { SettingsTopBar } from '@/components/shell'
import { Avatar, Button, EmptyState, useToast } from '@/components/ui'
import { FilterPills } from '@/components/email/filter-pills'
import { api } from '@/lib/api-client'
import { cn, formatBytes, formatRelativeTime } from '@/lib/utils'

interface Member {
  id: string
  userId: string
  name: string
  email: string
  avatarUrl: string | null
  role: string
  joinedAt?: string
  createdAt?: string
  /** Optional, surfaced when the backend exposes it. */
  lastActiveAt?: string | null
  /** Surfaced by the backend status column when present. */
  status?: 'active' | 'pending' | 'suspended' | 'disabled'
}

interface StorageBreakdown {
  totalBytes: number
  byCategory: { mail: number; attachments: number; drafts: number; trash: number }
  byUser: { userId: string; name: string; bytes: number }[]
}

type StatusFilter = 'all' | 'active' | 'pending' | 'suspended' | 'disabled'

/**
 * `/admin/users` — Pencil reference: `AdminV3-Users` (`hxB5G`).
 *
 * V3 polish:
 *   - Storage column joins per-user bytes from /billing/storage-breakdown
 *   - Tabs Active/Pending/Suspended/Disabled actually filter (when the
 *     backend gains a status column they'll filter rows; today an
 *     unknown status defaults to "active")
 *   - Hover row actions (edit / suspend / remove) — wired via toast
 *     stubs because the suspend/disable endpoints don't exist yet
 */
export default function AdminUsersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [storage, setStorage] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get<{ members?: Member[]; data?: Member[] }>('/api/v1/admin/members'),
      api.get<{ data: StorageBreakdown }>('/api/v1/billing/storage-breakdown'),
    ])
      .then(([memberRes, storageRes]) => {
        if (cancelled) return
        if (memberRes.status === 'fulfilled') {
          setMembers(memberRes.value.members ?? memberRes.value.data ?? [])
        }
        if (storageRes.status === 'fulfilled') {
          const map = new Map<string, number>()
          for (const u of storageRes.value.data.byUser) map.set(u.userId, u.bytes)
          setStorage(map)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const counts = useMemo(() => {
    const c = { all: members.length, active: 0, pending: 0, suspended: 0, disabled: 0 }
    for (const m of members) {
      const s = m.status ?? 'active'
      if (s === 'pending' || s === 'suspended' || s === 'disabled') c[s]++
      else c.active++
    }
    return c
  }, [members])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
      const status = m.status ?? 'active'
      if (filter !== 'all' && status !== filter) return false
      if (!q) return true
      return (
        (m.name ?? '').toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q)
      )
    })
  }, [members, filter, query])

  // Suspend/remove actions. The backend gained DELETE /admin/members/:id
  // (existing); suspend lives behind a TODO until the schema gains a
  // status column. Optimistic UX with a toast is fine for now.
  async function handleRemove(member: Member) {
    if (member.role === 'owner') {
      toast.show({ message: "Can't remove the workspace owner" })
      return
    }
    if (!confirm(`Remove ${member.name || member.email}? This cannot be undone.`)) return
    try {
      await api.delete(`/api/v1/admin/members/${member.id}`)
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      toast.show({ message: 'Member removed' })
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'Could not remove member',
      })
    }
  }

  function handleSuspend(member: Member) {
    // TODO(phase-h): wire to a real PATCH /admin/members/:id/suspend once
    // the users.status column ships. Today we acknowledge the click so the
    // UI feels live.
    toast.show({
      message: `Suspend not yet wired — ${member.name || member.email}`,
    })
  }

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar
        scope="Admin"
        page="Users"
        rightSlot={
          <Link
            href="/admin/users/new"
            className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
            style={{
              gap: 6,
              padding: '8px 14px',
              borderRadius: 18,
              boxShadow: '0 3px 14px 0 rgba(191,255,0,0.25)',
              color: '#000000',
            }}
          >
            <Plus style={{ width: 13, height: 13 }} />
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 11, letterSpacing: 1 }}
            >
              Invite user
            </span>
          </Link>
        }
      />

      <div
        className="flex flex-col"
        style={{ gap: 16, padding: '28px 32px 16px 32px' }}
      >
        <div className="flex items-end justify-between" style={{ gap: 16 }}>
          <div className="flex flex-col" style={{ gap: 6 }}>
            <h1
              className="font-mono font-bold text-wm-text-primary"
              style={{ fontSize: 30 }}
            >
              Users
            </h1>
            <p
              className="font-mono"
              style={{ fontSize: 12, color: '#6e6e6e' }}
            >
              {loading
                ? '…'
                : `${members.length} member${members.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <SearchField value={query} onChange={setQuery} />
        </div>
        <FilterPills<StatusFilter>
          value={filter}
          options={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'pending', label: 'Pending', count: counts.pending },
            { id: 'suspended', label: 'Suspended', count: counts.suspended },
            { id: 'disabled', label: 'Disabled', count: counts.disabled },
          ]}
          onChange={setFilter}
        />
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '0 32px 24px 32px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              filter === 'all'
                ? 'No members yet'
                : `No ${filter} members${query ? ` match "${query}"` : ''}`
            }
            description="Invite your first teammate to get started."
            action={
              <Link href="/admin/users/new">
                <Button icon={<Plus className="h-3.5 w-3.5" />}>Invite user</Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-wm-border bg-wm-surface">
            <table className="w-full font-mono text-[12px]">
              <thead className="border-b border-wm-border bg-wm-bg/50 text-left">
                <tr className="text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
                  <th className="px-5 py-3">Member</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Storage</th>
                  <th className="px-5 py-3">Last active</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const bytes = storage.get(m.userId) ?? 0
                  return (
                    <tr
                      key={m.id}
                      className="group border-b border-wm-border last:border-b-0 transition-colors hover:bg-wm-surface-hover"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={m.name || m.email}
                            src={m.avatarUrl}
                            size="sm"
                          />
                          <div className="flex flex-col">
                            <span className="font-sans text-[13px] font-medium text-wm-text-primary">
                              {m.name || '—'}
                            </span>
                            <span className="text-wm-text-tertiary">{m.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={
                            m.role === 'owner' || m.role === 'admin'
                              ? 'font-bold uppercase tracking-[1.5px] text-wm-accent'
                              : 'text-wm-text-secondary'
                          }
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-wm-text-secondary">
                        {bytes > 0 ? formatBytes(bytes) : '—'}
                      </td>
                      <td className="px-5 py-3 text-wm-text-tertiary">
                        {m.lastActiveAt
                          ? formatRelativeTime(new Date(m.lastActiveAt))
                          : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <RowAction
                            icon={<Pencil className="h-3 w-3" />}
                            label="Edit"
                            onClick={() => toast.show({ message: 'Edit coming soon' })}
                          />
                          <RowAction
                            icon={<UserMinus className="h-3 w-3" />}
                            label="Suspend"
                            onClick={() => handleSuspend(m)}
                          />
                          <RowAction
                            icon={<Trash2 className="h-3 w-3 text-wm-error" />}
                            label="Remove"
                            onClick={() => handleRemove(m)}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function RowAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-wm-border bg-wm-surface text-wm-text-secondary transition-colors hover:border-wm-accent hover:text-wm-text-primary"
    >
      {icon}
    </button>
  )
}

function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div
      className={cn(
        'flex h-9 w-64 items-center gap-2 rounded-md border border-wm-border bg-wm-surface px-3',
        'transition-colors focus-within:border-wm-accent',
      )}
    >
      <Search className="h-3.5 w-3.5 text-wm-text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name or email"
        className="flex-1 bg-transparent font-mono text-[12px] text-wm-text-primary placeholder:text-wm-text-muted outline-none"
      />
    </div>
  )
}
