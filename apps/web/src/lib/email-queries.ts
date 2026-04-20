'use client'

/// TanStack Query hooks for the inbox. All mutations are optimistic:
/// the cache is updated synchronously in `onMutate`, the network call
/// runs in the background, and `onError` rolls back if the server
/// rejects the change.
///
/// The shapes here mirror the API's slim EmailListItem so a list page
/// renders directly from the cache without a per-row transform.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { api } from './api-client'

export type EmailStatus = 'idle' | 'sending' | 'sent' | 'failed' | 'rate_limited'

export interface EmailListItem {
  id: string
  mailboxId: string
  fromAddress: string
  toAddresses: string[]
  cc: string[]
  subject: string
  snippet: string
  folder: string
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  hasAttachments: boolean
  sizeBytes: number
  status: EmailStatus
  sendError: string | null
  updatedAt: string
  createdAt: string
}

export interface EmailPage {
  data: EmailListItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface FullEmail extends EmailListItem {
  textBody: string | null
  htmlBody: string | null
  attachments: Array<{ id: string; filename: string; contentType: string; sizeBytes: number }>
}

export const inboxKeys = {
  all: ['inbox'] as const,
  list: (folder: string) => ['inbox', folder] as const,
  detail: (id: string) => ['inbox', 'email', id] as const,
}

const PAGE_SIZE = 50

export function useInboxList(folder: string) {
  return useInfiniteQuery({
    queryKey: inboxKeys.list(folder),
    queryFn: ({ pageParam = 1 }) =>
      api.get<EmailPage>(
        `/api/v1/inbox/emails?folder=${folder}&page=${pageParam}&pageSize=${PAGE_SIZE}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  })
}

export function useEmailDetail(id: string | null) {
  return useQuery({
    queryKey: id ? inboxKeys.detail(id) : ['inbox', 'email', 'none'],
    queryFn: () => api.get<FullEmail>(`/api/v1/inbox/emails/${id}`),
    enabled: !!id,
  })
}

/// Cache shape for an infinite-query list — what TanStack stores
/// internally for `useInfiniteQuery`.
interface InfiniteListCache {
  pages: EmailPage[]
  pageParams: unknown[]
}

/// Walk every cached inbox list page and apply `mutator` to the row
/// matching `id`. Handles both the infinite-query cache shape
/// (most lists) and the legacy single-page shape so callers don't
/// have to branch.
function applyToAllLists(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  mutator: (row: EmailListItem) => EmailListItem | null,
) {
  qc.setQueriesData<InfiniteListCache | EmailPage | undefined>(
    { queryKey: inboxKeys.all },
    (old) => {
      if (!old) return old
      // Infinite-query shape — mutate across every page.
      if ('pages' in old && Array.isArray(old.pages)) {
        let touched = false
        const pages = old.pages.map((p) => {
          let mutated = false
          const data: EmailListItem[] = []
          for (const row of p.data) {
            if (row.id === id) {
              const next = mutator(row)
              if (next === null) {
                mutated = true
                continue
              }
              if (next !== row) mutated = true
              data.push(next)
            } else {
              data.push(row)
            }
          }
          if (mutated) {
            touched = true
            return { ...p, data }
          }
          return p
        })
        return touched ? { ...old, pages } : old
      }
      // Single-page shape (detail-list endpoints, search etc.)
      if ('data' in old && Array.isArray(old.data)) {
        let mutated = false
        const data: EmailListItem[] = []
        for (const row of old.data) {
          if (row.id === id) {
            const next = mutator(row)
            if (next === null) {
              mutated = true
              continue
            }
            if (next !== row) mutated = true
            data.push(next)
          } else {
            data.push(row)
          }
        }
        return mutated ? { ...old, data } : old
      }
      return old
    },
  )
}

interface OptimisticContext {
  /// Snapshot of every list cache the mutation touched, keyed by
  /// QueryKey so onError can restore them verbatim.
  snapshots: Array<{ key: QueryKey; data: unknown }>
}

/// Snapshot every list cache so we can roll back if the server
/// rejects the mutation. Returns the snapshots; the caller passes
/// them through onError.
function snapshotLists(qc: ReturnType<typeof useQueryClient>): OptimisticContext {
  const entries = qc.getQueriesData({ queryKey: inboxKeys.all })
  return {
    snapshots: entries.map(([key, data]) => ({ key, data })),
  }
}

function restoreLists(
  qc: ReturnType<typeof useQueryClient>,
  ctx: OptimisticContext | undefined,
) {
  if (!ctx) return
  for (const snap of ctx.snapshots) {
    qc.setQueryData(snap.key, snap.data)
  }
}

export function useToggleStar() {
  const qc = useQueryClient()
  return useMutation<{ starred: boolean }, Error, EmailListItem, OptimisticContext>({
    mutationFn: (email) =>
      api.post<{ starred: boolean }>(`/api/v1/inbox/emails/${email.id}/star`),
    onMutate: async (email) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all })
      const ctx = snapshotLists(qc)
      applyToAllLists(qc, email.id, (row) => ({ ...row, isStarred: !row.isStarred }))
      qc.setQueryData<FullEmail>(inboxKeys.detail(email.id), (old) =>
        old ? { ...old, isStarred: !old.isStarred } : old,
      )
      return ctx
    },
    onError: (_err, _email, ctx) => restoreLists(qc, ctx),
    // No onSuccess invalidate — the WS event will reconcile if the
    // server's truth differs from our optimistic flip.
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: string }, OptimisticContext>({
    mutationFn: ({ id }) => api.post(`/api/v1/inbox/emails/${id}/read`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all })
      const ctx = snapshotLists(qc)
      applyToAllLists(qc, id, (row) => ({ ...row, isRead: true }))
      return ctx
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx),
  })
}

export function useMarkUnread() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: string }, OptimisticContext>({
    mutationFn: ({ id }) => api.post(`/api/v1/inbox/emails/${id}/unread`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all })
      const ctx = snapshotLists(qc)
      applyToAllLists(qc, id, (row) => ({ ...row, isRead: false }))
      return ctx
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx),
  })
}

export function useArchive() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: string }, OptimisticContext>({
    mutationFn: ({ id }) => api.post(`/api/v1/inbox/emails/${id}/archive`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all })
      const ctx = snapshotLists(qc)
      // Drop the row from the visible list right away. If the server
      // rejects, restoreLists puts it back.
      applyToAllLists(qc, id, () => null)
      return ctx
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx),
  })
}

export function useDelete() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: string }, OptimisticContext>({
    mutationFn: ({ id }) => api.post(`/api/v1/inbox/emails/${id}/delete`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all })
      const ctx = snapshotLists(qc)
      applyToAllLists(qc, id, () => null)
      return ctx
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx),
  })
}

/// Apply a server-pushed status change (from the email.send_status
/// WS event) to every cached list. Doesn't touch network.
export function applySendStatus(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  status: EmailStatus,
  error: string | null,
) {
  applyToAllLists(qc, id, (row) => ({
    ...row,
    status,
    sendError: error,
  }))
  qc.setQueryData<FullEmail>(inboxKeys.detail(id), (old) =>
    old ? { ...old, status, sendError: error } : old,
  )
}

/// Apply a generic server-pushed update (email.updated WS event) to
/// every cached list. Used by the WS bridge.
export function applyServerUpdate(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  changes: { isRead?: boolean; isStarred?: boolean; folder?: string },
) {
  applyToAllLists(qc, id, (row) => {
    let next = row
    if (changes.isRead !== undefined && next.isRead !== changes.isRead) {
      next = { ...next, isRead: changes.isRead }
    }
    if (changes.isStarred !== undefined && next.isStarred !== changes.isStarred) {
      next = { ...next, isStarred: changes.isStarred }
    }
    if (changes.folder !== undefined && next.folder !== changes.folder) {
      // Folder changed away from the current view — drop from this list.
      // (The list query key encodes the folder; the new folder's list
      // will refetch when the user navigates there.)
      return null
    }
    return next
  })
}
