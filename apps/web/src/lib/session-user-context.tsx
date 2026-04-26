'use client'

import { createContext, useContext, type ReactNode } from 'react'

/// Client-side handle on the authenticated user. Seeded by the
/// server-rendered (app) layout from `getServerSession()`, then
/// passed through this context so deep client components (chat
/// thread, compose, etc.) can render "is this me?" comparisons
/// without a refetch.

export interface SessionUserClient {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

const SessionUserContext = createContext<SessionUserClient | null>(null)

export function SessionUserProvider({
  user,
  children,
}: {
  user: SessionUserClient
  children: ReactNode
}) {
  return (
    <SessionUserContext.Provider value={user}>
      {children}
    </SessionUserContext.Provider>
  )
}

export function useSessionUser(): SessionUserClient {
  const ctx = useContext(SessionUserContext)
  if (!ctx) {
    throw new Error('useSessionUser must be used inside SessionUserProvider')
  }
  return ctx
}
