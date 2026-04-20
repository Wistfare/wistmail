'use client'

/// TanStack Query hooks + types for the labels feature.
///
/// All endpoints live at /api/v1/labels and were already shipped on
/// the API side. The shapes here mirror the response payloads exactly
/// so consumers can render directly without a transform.

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from './api-client'

export interface Label {
  id: string
  name: string
  color: string
  mailboxId: string
}

interface LabelsResponse {
  labels: Label[]
}

export const labelKeys = {
  all: ['labels'] as const,
  list: () => ['labels', 'list'] as const,
  forEmail: (emailId: string) => ['labels', 'email', emailId] as const,
}

export function useLabels() {
  return useQuery({
    queryKey: labelKeys.list(),
    queryFn: () => api.get<LabelsResponse>('/api/v1/labels'),
    select: (data) => data.labels,
  })
}

export function useLabelsForEmail(emailId: string | null) {
  return useQuery({
    queryKey: emailId ? labelKeys.forEmail(emailId) : ['labels', 'email', 'none'],
    queryFn: () =>
      api.get<LabelsResponse>(`/api/v1/labels/email/${emailId}`),
    select: (data) => data.labels,
    enabled: !!emailId,
  })
}

export function useCreateLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; color: string; mailboxId: string }) =>
      api.post<{ id: string }>('/api/v1/labels', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: labelKeys.list() }),
  })
}

export function useUpdateLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string
      name?: string
      color?: string
    }) => api.patch<{ ok: true }>(`/api/v1/labels/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: labelKeys.all }),
  })
}

export function useDeleteLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ ok: true }>(`/api/v1/labels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: labelKeys.all }),
  })
}

/// Set the full set of labels assigned to an email. Optimistic — the
/// inbox row updates instantly; the email-detail label-assign popover
/// also gets the new state immediately.
export function useSetLabelsForEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ emailId, labelIds }: { emailId: string; labelIds: string[] }) =>
      api.put<{ ok: true }>(`/api/v1/labels/email/${emailId}`, { labelIds }),
    onSuccess: (_, { emailId }) => {
      qc.invalidateQueries({ queryKey: labelKeys.forEmail(emailId) })
    },
  })
}
