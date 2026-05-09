'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/// /chat decommissioned — the unified inbox is the single source of
/// truth for both mail and conversations.  Visiting /chat now bounces
/// the user to /inbox with the CHATS filter pre-selected so the
/// experience is identical to clicking the CHATS pill in the
/// segmented control.
///
/// The page-level redirect is preferred over a Next.js redirect rule
/// so we keep client-side navigation snappy and don't bust the
/// session cookie.
export default function ChatIndexRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/inbox?kind=chats')
  }, [router])
  return null
}
