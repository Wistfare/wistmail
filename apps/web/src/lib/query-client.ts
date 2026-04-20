'use client'

/// Singleton TanStack Query client. We instantiate per-window so SSR
/// doesn't share state across requests; the provider component
/// (QueryProvider) handles the lazy init.

import { QueryClient } from '@tanstack/react-query'

let client: QueryClient | null = null

export function getQueryClient(): QueryClient {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          // Inbox lists are cheap to refetch but expensive to render
          // — 30s freshness keeps tab switches snappy without showing
          // stale flag state for long.
          staleTime: 30 * 1000,
          // 5 min cache so navigating away + back doesn't refetch.
          gcTime: 5 * 60 * 1000,
          refetchOnWindowFocus: true,
          retry: 1,
        },
        mutations: {
          // Optimistic mutations rely on onMutate/onError; the default
          // single retry would replay a mutation the server already
          // accepted on error, doubling the effect.
          retry: false,
        },
      },
    })
  }
  return client
}
