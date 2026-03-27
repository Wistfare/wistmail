'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api-client'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    async function checkState() {
      try {
        // First check if the system has any users (fresh install?)
        const setupStatus = await api.get<{ hasUsers: boolean; inProgress: boolean }>('/api/v1/setup/status')

        if (!setupStatus.hasUsers) {
          // Fresh install — no users exist yet
          if (setupStatus.inProgress) {
            // Setup was started but not finished — resume
            router.replace('/setup')
          } else {
            // Brand new — start setup
            router.replace('/setup')
          }
          return
        }

        // Users exist — check if current user is logged in
        const session = await api.get<{ user: { setupComplete: boolean } | null }>('/api/v1/auth/session')

        if (!session.user) {
          router.replace('/login')
        } else {
          router.replace('/inbox')
        }
      } catch {
        // If API is down, try login page
        router.replace('/login')
      }
    }

    checkState()
  }, [router])

  return (
    <div className="flex h-screen items-center justify-center bg-wm-bg">
      <div className="h-6 w-6 animate-spin border-2 border-wm-accent border-t-transparent" />
    </div>
  )
}
