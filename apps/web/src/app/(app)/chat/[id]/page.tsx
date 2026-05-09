'use client'

import { use } from 'react'
import { ChatThreadView } from '@/components/chat/chat-thread-view'

/// Thin route wrapper. The actual UI lives in
/// `components/chat/chat-thread-view.tsx` so the inbox can mount the
/// same view inline in its right reading pane (commit 3 of the
/// unified-inbox migration).  This wrapper exists for two reasons:
///
///  1. Backwards-compatible URLs — links shared as /chat/<id> keep
///     working through the migration.
///  2. Push-notification deep-links land on a real page, not a
///     query-string variant of /inbox.
///
/// The wrapper itself does no work beyond unwrapping `params.id` and
/// forwarding it to the view; commit 4 of the migration will redirect
/// /chat/<id> back to /inbox?selected=chat:<id> and remove this file
/// entirely.
export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: conversationId } = use(params)
  return <ChatThreadView conversationId={conversationId} />
}
