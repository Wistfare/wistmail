'use client'

/// Recipient suggestions hook. Debounces queries to /contacts/search
/// (200 ms) and exposes the result as a ranked list. Empty queries
/// hit the endpoint too — the backend returns recent recipients,
/// which makes the dropdown useful as a "default state" right after
/// the user focuses the To field.

import { useEffect, useRef, useState } from 'react'
import { api } from './api-client'

export interface ContactSuggestion {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  source: 'org_member' | 'contact' | 'recent'
}

interface SearchResponse {
  data: ContactSuggestion[]
}

/// `query` is the live (uncommitted) text in the chip input.
/// `enabled` lets a parent suspend fetches (e.g. while the dropdown
/// is hidden because no chip-field has focus).
export function useContactSuggestions(query: string, enabled: boolean): {
  suggestions: ContactSuggestion[]
  loading: boolean
} {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const tokenRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setSuggestions([])
      setLoading(false)
      return
    }
    const myToken = ++tokenRef.current
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await api.get<SearchResponse>(
          `/api/v1/contacts/search?q=${encodeURIComponent(query)}&limit=8`,
        )
        // Stale-response guard — if a newer keystroke fired while
        // this fetch was in flight, drop our result on the floor.
        if (myToken !== tokenRef.current) return
        setSuggestions(res.data ?? [])
      } catch {
        if (myToken === tokenRef.current) setSuggestions([])
      } finally {
        if (myToken === tokenRef.current) setLoading(false)
      }
    }, 200)
    return () => clearTimeout(handle)
  }, [query, enabled])

  return { suggestions, loading }
}
