'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Compose is now a floating popup. Redirect to inbox. */
export default function ComposePage() {
  const router = useRouter()
  useEffect(() => { router.replace('/inbox') }, [router])
  return null
}
