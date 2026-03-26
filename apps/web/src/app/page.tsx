'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api-client'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    api
      .get<{ user: { setupComplete: boolean } | null }>('/api/v1/auth/session')
      .then((res) => {
        if (!res.user) {
          router.replace('/login')
        } else if (!res.user.setupComplete) {
          router.replace('/setup')
        } else {
          router.replace('/inbox')
        }
      })
      .catch(() => {
        router.replace('/login')
      })
  }, [router])

  return (
    <div className="flex h-screen items-center justify-center bg-wm-bg">
      <div className="h-6 w-6 animate-spin border-2 border-wm-accent border-t-transparent" />
    </div>
  )
}
