'use client'

import { useState, useEffect } from 'react'
import { Users, UserPlus, Shield, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { SettingsCard } from '@/components/ui/settings-card'
import { api } from '@/lib/api-client'

type Member = {
  id: string
  userId: string
  role: string
  name: string
  email: string
  avatarUrl: string | null
  joinedAt: string
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    api.get<{ data: Member[] }>('/api/v1/admin/members').then((res) => {
      setMembers(res.data)
    }).catch(() => {})
  }, [])

  async function changeRole(memberId: string, newRole: string) {
    try {
      await api.patch(`/api/v1/admin/members/${memberId}/role`, { role: newRole })
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
      )
    } catch {}
  }

  async function removeMember(memberId: string) {
    try {
      await api.delete(`/api/v1/admin/members/${memberId}`)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch {}
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Members</h1>
        <div className="flex-1" />
        <Button variant="primary" size="sm" icon={<UserPlus className="h-4 w-4" />}>
          Invite Member
        </Button>
      </div>

      <SettingsCard title="">
        <div className="flex flex-col">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-4 border-b border-wm-border py-3 last:border-b-0"
            >
              <Avatar name={member.name} size="md" />
              <div className="flex-1">
                <p className="text-sm font-medium text-wm-text-primary">{member.name}</p>
                <p className="font-mono text-xs text-wm-text-muted">{member.email}</p>
              </div>
              <Badge
                variant={member.role === 'owner' ? 'accent' : member.role === 'admin' ? 'info' : 'default'}
              >
                {member.role}
              </Badge>
              {member.role !== 'owner' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => changeRole(member.id, member.role === 'admin' ? 'member' : 'admin')}
                    className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
                    title={member.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                  >
                    <Shield className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="cursor-pointer text-wm-text-muted hover:text-wm-error"
                    title="Remove member"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Users className="h-8 w-8 text-wm-text-muted" />
              <p className="font-mono text-sm text-wm-text-tertiary">No members yet. Create an organization first.</p>
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  )
}
