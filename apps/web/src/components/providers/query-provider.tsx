'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '@/lib/query-client'
import { RealtimeBridge } from '@/lib/realtime-bridge'

/// Wraps the app shell. Lives as a client component so the (server)
/// layout in apps/web/src/app/(app)/layout.tsx can still SSR-redirect
/// before any client JS loads.
///
/// Mounts the WS-to-cache bridge alongside the provider so every
/// authenticated screen automatically has live state.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <RealtimeBridge />
      {children}
    </QueryClientProvider>
  )
}
