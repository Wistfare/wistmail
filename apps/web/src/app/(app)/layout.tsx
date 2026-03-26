'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { api } from '@/lib/api-client'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{
    name: string
    email: string
    avatarUrl?: string
  } | null>(null)

  useEffect(() => {
    api
      .get<{ user: { name: string; email: string; avatarUrl: string | null } | null }>(
        '/api/v1/auth/session',
      )
      .then((res) => {
        if (res.user) {
          setUser({
            name: res.user.name,
            email: res.user.email,
            avatarUrl: res.user.avatarUrl ?? undefined,
          })
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        user={user || { name: '', email: '' }}
        activeRoute="/inbox"
        unreadCounts={{ inbox: 0 }}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
