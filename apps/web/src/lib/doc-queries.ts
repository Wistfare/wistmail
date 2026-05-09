'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api-client'

export type DocStatus = 'draft' | 'in_review' | 'published'

export interface DocSummary {
  id: string
  ownerId: string
  projectId: string | null
  title: string
  icon: string | null
  body: string | null
  status: DocStatus
  shareToken: string | null
  createdAt: string
  updatedAt: string
}

export interface DocInput {
  title: string
  icon?: string | null
  body?: string | null
  projectId?: string | null
  status?: DocStatus
}

export interface DocComment {
  id: string
  docId: string
  authorId: string
  body: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

const KEY = ['docs'] as const

/** List all docs the user owns, most-recent first. */
export function useDocs(projectId?: string) {
  return useQuery({
    queryKey: [...KEY, projectId ?? 'all'],
    queryFn: async () => {
      const url = projectId
        ? `/api/v1/docs?projectId=${encodeURIComponent(projectId)}`
        : '/api/v1/docs'
      const res = await api.get<{ docs: DocSummary[] }>(url)
      return res.docs
    },
    staleTime: 30_000,
  })
}

export function useDoc(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => api.get<DocSummary>(`/api/v1/docs/${id}`),
    enabled: !!id,
  })
}

export function useCreateDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: DocInput) => api.post<DocSummary>('/api/v1/docs', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Update title / icon / body / projectId. Optimistic — the editor's
 * autosave fires this on every keystroke, so we patch the cache locally
 * to avoid flicker, then reconcile on success.
 */
export function useUpdateDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<DocInput> & { id: string }) =>
      api.patch<DocSummary>(`/api/v1/docs/${id}`, patch),
    onMutate: async ({ id, ...patch }) => {
      const detailKey = [...KEY, 'detail', id]
      await qc.cancelQueries({ queryKey: detailKey })
      const prev = qc.getQueryData<DocSummary>(detailKey)
      if (prev) {
        qc.setQueryData<DocSummary>(detailKey, {
          ...prev,
          ...patch,
          updatedAt: new Date().toISOString(),
        } as DocSummary)
      }
      return { prev }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData([...KEY, 'detail', vars.id], ctx.prev)
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: [...KEY, 'detail', vars.id] })
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

export function useDeleteDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ ok: true }>(`/api/v1/docs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

/** Issue or rotate a share token; returns the new opaque token. */
export function useShareDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ shareToken: string }>(`/api/v1/docs/${id}/share`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [...KEY, 'detail', id] })
    },
  })
}

export function useRevokeShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ ok: true }>(`/api/v1/docs/${id}/share`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [...KEY, 'detail', id] })
    },
  })
}

export function useDocComments(docId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'comments', docId],
    queryFn: () =>
      api
        .get<{ comments: DocComment[] }>(`/api/v1/docs/${docId}/comments`)
        .then((r) => r.comments),
    enabled: !!docId,
    staleTime: 15_000,
  })
}

export function useAddDocComment(docId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) =>
      api.post<DocComment>(`/api/v1/docs/${docId}/comments`, { body }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...KEY, 'comments', docId] }),
  })
}

export function useDeleteDocComment(docId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete<{ ok: true }>(`/api/v1/docs/comments/${commentId}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...KEY, 'comments', docId] }),
  })
}
