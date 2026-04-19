/// Per-tab cache for the user's mailboxes. Mailbox lists change rarely
/// (only when a domain is added/removed) so the compose modal, sidebar,
/// and any settings pages can share one fetch.

import { api } from './api-client'

export type Mailbox = { id: string; address: string; displayName: string }

let cached: Mailbox[] | null = null
let inflight: Promise<Mailbox[]> | null = null

export async function getMailboxes(): Promise<Mailbox[]> {
  if (cached) return cached
  if (inflight) return inflight
  inflight = api
    .get<{ data: Mailbox[] }>('/api/v1/setup/mailboxes')
    .then((res) => {
      cached = res.data ?? []
      return cached
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/// Invalidate after a domain add / mailbox provision so the next call
/// re-fetches.
export function invalidateMailboxes() {
  cached = null
  inflight = null
}
