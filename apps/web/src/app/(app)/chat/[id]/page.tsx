'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'

/// /chat/<id> deep-links into the unified inbox view.
///
/// The standalone chat screen was decommissioned with the
/// unified-inbox migration: chat threads now open inline in the
/// inbox right reading pane. This file is kept so existing /chat/<id>
/// bookmarks, push notifications, and email links keep landing the
/// user on the right conversation — we just bounce them to
/// `/inbox?chat=<id>` and the inbox does the rest.
export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  useEffect(() => {
    router.replace(`/inbox?chat=${encodeURIComponent(id)}`)
  }, [id, router])
  return null
}
