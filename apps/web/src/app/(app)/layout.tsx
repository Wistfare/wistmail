'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { api } from '@/lib/api-client'

type SessionUser = {
  name: string
  email: string
  avatarUrl: string | null
  setupComplete: boolean
  role: string
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    api
      .get<{ user: SessionUser | null }>('/api/v1/auth/session')
      .then((res) => {
        if (!res.user) {
          router.replace('/login')
          return
        }
        setUser(res.user)

        // Force setup wizard if not complete (unless already on /setup)
        if (!res.user.setupComplete && !pathname.startsWith('/setup')) {
          router.replace('/setup')
        }
      })
      .catch(() => {
        router.replace('/login')
      })
      .finally(() => setLoading(false))
  }, [router, pathname])

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-wm-bg">
        <div className="h-6 w-6 animate-spin border-2 border-wm-accent border-t-transparent" />
      </div>
    )
  }

  // Setup wizard pages don't show the sidebar
  if (pathname.startsWith('/setup')) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl ?? undefined, role: user.role }}
        activeRoute={pathname}
        unreadCounts={{ inbox: 0 }}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
