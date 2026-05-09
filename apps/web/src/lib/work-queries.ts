'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api-client'

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Project {
  id: string
  ownerId: string
  name: string
  description: string | null
  status: 'active' | 'completed' | 'archived'
  progress: number
  memberUserIds: string[]
  dueDate: string | null
  createdAt: string
  updatedAt: string
  /** Optional emoji or symbol prefix; future addition. */
  emoji?: string
}

export interface ProjectTask {
  id: string
  projectId: string
  title: string
  status: TaskStatus
  assigneeId: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskInput {
  title: string
  status?: TaskStatus
  assigneeId?: string | null
  dueDate?: string | null
}

const PROJECTS_KEY = ['work', 'projects'] as const

/** List of all projects the user owns / belongs to. */
export function useProjects() {
  return useQuery({
    queryKey: [...PROJECTS_KEY],
    queryFn: () => api.get<{ projects: Project[] }>('/api/v1/projects').then((r) => r.projects),
    staleTime: 30_000,
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, id],
    queryFn: () => api.get<Project>(`/api/v1/projects/${id}`),
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      api.post<Project>('/api/v1/projects', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  })
}

export function useTasks(projectId: string | null) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, projectId, 'tasks'],
    queryFn: () =>
      api
        .get<{ tasks: ProjectTask[] }>(`/api/v1/projects/${projectId}/tasks`)
        .then((r) => r.tasks),
    enabled: !!projectId,
    staleTime: 15_000,
  })
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TaskInput) =>
      api.post<ProjectTask>(`/api/v1/projects/${projectId}/tasks`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...PROJECTS_KEY, projectId, 'tasks'] }),
  })
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    // Optimistic update: flip status / fields immediately so kanban
    // drag-and-drop feels instant. Roll back on failure.
    mutationFn: ({ id, ...patch }: Partial<TaskInput> & { id: string }) =>
      api.patch<ProjectTask>(`/api/v1/projects/${projectId}/tasks/${id}`, patch),
    onMutate: async ({ id, ...patch }) => {
      const key = [...PROJECTS_KEY, projectId, 'tasks']
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ProjectTask[]>(key)
      if (prev) {
        qc.setQueryData<ProjectTask[]>(
          key,
          prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        )
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData([...PROJECTS_KEY, projectId, 'tasks'], ctx.prev)
      }
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: [...PROJECTS_KEY, projectId, 'tasks'] }),
  })
}

export interface TodayDigest {
  greeting: string
  date: string
  tasks: Array<{
    id: string
    projectId: string
    projectName: string
    title: string
    status: TaskStatus
    dueDate: string | null
  }>
  meetings?: Array<{
    id: string
    title: string
    startsAt: string
    endsAt?: string | null
    meetingLink?: string | null
  }>
  needsReply?: Array<{
    id: string
    fromAddress: string
    subject: string
    snippet: string
  }>
}

/** Today aggregator — read-only feed for the WorkV3 "My day" page. */
export function useToday() {
  return useQuery({
    queryKey: ['work', 'today'],
    queryFn: () => api.get<TodayDigest>('/api/v1/today'),
    staleTime: 60_000,
  })
}
