'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import { Avatar, Button, EmptyState } from '@/components/ui'
import { FilterPills } from '@/components/email/filter-pills'
import { api } from '@/lib/api-client'
import { cn, formatRelativeTime } from '@/lib/utils'

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
}

type StatusFilter = 'all' | 'active' | 'pending' | 'suspended'

/**
 * `/admin/users` — Pencil reference: `AdminV3-Users` (`hxB5G`).
 *
 * V3 chrome: PageHeader + filter pill row + search input + table.
 * Reads `/api/v1/admin/members`. Suspended/pending tabs reserve room
 * for when the backend gains a status column — today they return zero.
 */
export default function AdminUsersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .get<{ members?: Member[]; data?: Member[] }>('/api/v1/admin/members')
      .then((res) => {
        if (cancelled) return
        // Backwards-compat with both response shapes.
        setMembers(res.members ?? res.data ?? [])
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
      // Filter pill — until the backend gains a status column, all
      // members count as "active" and we show none in pending/suspended.
      if (filter === 'pending' || filter === 'suspended') return false
      if (!q) return true
      return (
        (m.name ?? '').toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q)
      )
    })
  }, [members, filter, query])

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        subtitle={
          loading
            ? undefined
            : `${members.length} member${members.length === 1 ? '' : 's'}`
        }
        actions={
          <>
            <SearchField value={query} onChange={setQuery} />
            <Link href="/admin/users/new">
              <Button icon={<Plus className="h-3.5 w-3.5" />}>Invite user</Button>
            </Link>
          </>
        }
        toolbar={
          <FilterPills<StatusFilter>
            value={filter}
            options={[
              { id: 'all', label: 'All', count: members.length },
              { id: 'active', label: 'Active', count: members.length },
              { id: 'pending', label: 'Pending' },
              { id: 'suspended', label: 'Suspended' },
            ]}
            onChange={setFilter}
          />
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
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
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-wm-border last:border-b-0 transition-colors hover:bg-wm-surface-hover"
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
                    <td className="px-5 py-3 text-wm-text-secondary">—</td>
                    <td className="px-5 py-3 text-wm-text-tertiary">
                      {m.lastActiveAt
                        ? formatRelativeTime(new Date(m.lastActiveAt))
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/members#${m.id}`}
                        className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-accent hover:underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
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
