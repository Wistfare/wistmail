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

export interface EmailLabelRef {
  id: string
  name: string
  color: string
}

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
  /// Labels shipped inline with every list row so the inbox doesn't
  /// have to fire a per-row `/labels/email/:id` request (was the old
  /// N+1 pattern — 50 rows ⇒ 50 sequential calls).
  labels: EmailLabelRef[]
}

export interface EmailPage {
  data: EmailListItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface ParsedIcs {
  uid: string
  method: string | null
  summary: string | null
  description: string | null
  location: string | null
  startAt: string | null
  endAt: string | null
  allDay: boolean
  organizer: { email: string; name: string | null } | null
  attendees: Array<{ email: string; name: string | null; rsvp: boolean }>
  sequence: number
}

export interface FullEmail extends EmailListItem {
  textBody: string | null
  htmlBody: string | null
  attachments: Array<{
    id: string
    filename: string
    contentType: string
    sizeBytes: number
    parsedIcs?: ParsedIcs
    /// Last RSVP choice the user sent for this invite, if any.
    /// Preserved across sessions so the ICS card can show "You
    /// accepted this" without the user having to re-respond.
    rsvpResponse?: 'accept' | 'tentative' | 'decline' | null
    rsvpRespondedAt?: string | null
  }>
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

/// Permanent delete — only valid when the email is already in
/// folder='trash'. The API rejects attempts on inbox rows with a 409
/// to stop us from accidentally hard-deleting fresh mail.
export function usePurge() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: string }, OptimisticContext>({
    mutationFn: ({ id }) => api.post(`/api/v1/inbox/emails/${id}/purge`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all })
      const ctx = snapshotLists(qc)
      applyToAllLists(qc, id, () => null)
      return ctx
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx),
  })
}

/// Empty the entire Trash or Spam folder in one go — the nuclear
/// option the user reaches via a visible button above the list.
/// Optimistic at the cache level (nukes the target list immediately);
/// rollback on error.
export function useEmptyFolder() {
  const qc = useQueryClient()
  return useMutation<
    unknown,
    Error,
    { folder: 'trash' | 'spam' },
    OptimisticContext
  >({
    mutationFn: ({ folder }) =>
      api.post(`/api/v1/inbox/folders/${folder}/empty`),
    onMutate: async ({ folder }) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all })
      const ctx = snapshotLists(qc)
      qc.setQueriesData<InfiniteListCache>(
        { queryKey: inboxKeys.list(folder) },
        (old) =>
          old
            ? { ...old, pages: old.pages.map((p) => ({ ...p, data: [], total: 0 })) }
            : old,
      )
      return ctx
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: inboxKeys.list(vars.folder) })
    },
  })
}

/// Legacy alias — pre-existing callers expected a void-mutation that
/// only hit trash. Kept as a thin wrapper so we don't churn all call
/// sites at once.
export function useEmptyTrash() {
  const mutation = useEmptyFolder()
  return {
    ...mutation,
    mutate: () => mutation.mutate({ folder: 'trash' }),
    mutateAsync: () => mutation.mutateAsync({ folder: 'trash' }),
  }
}

/// Bulk action against many emails at once. The server accepts one
/// action per call + a list of ids; we optimistically apply the same
/// mutation to every matching row in every cached list page so the
/// selection clears instantly. Rollback on error restores all pages.
export type BulkAction =
  | { action: 'read' }
  | { action: 'unread' }
  | { action: 'star' }
  | { action: 'unstar' }
  | { action: 'archive' }
  | { action: 'delete' }
  | { action: 'purge' }
  | { action: 'move'; folder: string }
  | { action: 'label-add'; labelIds: string[] }
  | { action: 'label-remove'; labelIds: string[] }

export function useBulkAction() {
  const qc = useQueryClient()
  return useMutation<
    unknown,
    Error,
    { ids: string[] } & BulkAction,
    OptimisticContext
  >({
    mutationFn: (vars) =>
      api.post(`/api/v1/inbox/emails/batch`, {
        ids: vars.ids,
        action: vars.action,
        folder: 'folder' in vars ? vars.folder : undefined,
        labelIds: 'labelIds' in vars ? vars.labelIds : undefined,
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all })
      const ctx = snapshotLists(qc)
      const idSet = new Set(vars.ids)
      for (const id of vars.ids) {
        applyToAllLists(qc, id, (row) => {
          if (!idSet.has(row.id)) return row
          switch (vars.action) {
            case 'read':
              return { ...row, isRead: true }
            case 'unread':
              return { ...row, isRead: false }
            case 'star':
              return { ...row, isStarred: true }
            case 'unstar':
              return { ...row, isStarred: false }
            case 'archive':
              return null
            case 'delete':
            case 'purge':
              return null
            case 'move':
              return null
            case 'label-add':
            case 'label-remove':
              // Labels rehydrate via refetch — keep the row cached
              // so we don't flash it away and back.
              return row
          }
        })
      }
      return ctx
    },
    onError: (_err, _vars, ctx) => restoreLists(qc, ctx),
    onSettled: (_data, _err, vars) => {
      // Labels mutations need a refetch for the chips to reflect
      // the new assignments; other actions already wrote the final
      // shape in onMutate.
      if (vars.action === 'label-add' || vars.action === 'label-remove') {
        qc.invalidateQueries({ queryKey: inboxKeys.all })
      }
    },
  })
}

/// Retention window (e.g. 30 days) for a folder that auto-purges.
/// Powers the "Emails here are permanently deleted after N days"
/// banner on Trash and Spam.
export function useFolderRetention(folder: 'trash' | 'spam') {
  return useQuery({
    queryKey: ['inbox', folder, 'config'],
    queryFn: () =>
      api.get<{ retentionDays: number }>(
        `/api/v1/inbox/folders/${folder}/config`,
      ),
    staleTime: 60 * 60 * 1000, // never really changes in a session
  })
}

/// Legacy alias — same shape as the old useTrashRetention.
export function useTrashRetention() {
  return useFolderRetention('trash')
}

/// Mark every unread email in a given folder as read. The server
/// scopes to the user's mailboxes; no client-side id set needed.
/// `folder` can also be 'all' to mark read across every folder at
/// once (the Gmail-style "clear the dot").
export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation<
    { affected: number },
    Error,
    { folder: string },
    OptimisticContext
  >({
    mutationFn: ({ folder }) =>
      api.post<{ affected: number }>(
        `/api/v1/inbox/folders/${folder}/mark-all-read`,
      ),
    onMutate: async ({ folder }) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all })
      const ctx = snapshotLists(qc)
      // Flip isRead on every cached row in the target folder (or
      // everywhere if 'all'). Keeps the UI snappy; the server
      // response just confirms the count.
      qc.setQueriesData<InfiniteListCache>(
        { queryKey: folder === 'all' ? inboxKeys.all : inboxKeys.list(folder) },
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((p) => ({
                  ...p,
                  data: p.data.map((row) =>
                    row.isRead ? row : { ...row, isRead: true },
                  ),
                })),
              }
            : old,
      )
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
