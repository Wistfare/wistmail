'use client'

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'

/// Process-wide bus for `chat.typing` events. The realtime bridge
/// pushes incoming pings here; the conversation thread subscribes to
/// the slice for the conversation it's rendering.
///
/// Each (conversationId, typerId) entry carries an expiry timestamp
/// — clients render the indicator until then. We re-check expiries
/// on a 1s interval so a stalled typer fades out without needing a
/// dedicated "stopped typing" event.

export interface TypingEntry {
  typerId: string
  typerName: string
  expiresAt: number
}

const TYPING_TTL_MS = 5_000
const EMPTY: TypingEntry[] = []

class TypingStore {
  private byConversation = new Map<string, TypingEntry[]>()
  private listeners = new Set<() => void>()
  private interval: ReturnType<typeof setInterval> | null = null

  start(): void {
    if (this.interval) return
    this.interval = setInterval(() => this.sweep(), 1_000)
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval)
    this.interval = null
  }

  push(input: { conversationId: string; typerId: string; typerName: string }): void {
    const expiresAt = Date.now() + TYPING_TTL_MS
    const existing = this.byConversation.get(input.conversationId) ?? []
    const next = existing.filter((e) => e.typerId !== input.typerId)
    next.push({
      typerId: input.typerId,
      typerName: input.typerName,
      expiresAt,
    })
    this.byConversation.set(input.conversationId, next)
    this.notify()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  snapshot(conversationId: string): TypingEntry[] {
    return this.byConversation.get(conversationId) ?? EMPTY
  }

  private sweep(): void {
    const now = Date.now()
    let mutated = false
    for (const [cid, entries] of this.byConversation.entries()) {
      const live = entries.filter((e) => e.expiresAt > now)
      if (live.length !== entries.length) {
        if (live.length === 0) this.byConversation.delete(cid)
        else this.byConversation.set(cid, live)
        mutated = true
      }
    }
    if (mutated) this.notify()
  }

  private notify(): void {
    for (const fn of this.listeners) fn()
  }
}

const TypingBusContext = createContext<TypingStore | null>(null)

export function TypingBusProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<TypingStore | null>(null)
  if (!storeRef.current) storeRef.current = new TypingStore()

  useEffect(() => {
    const s = storeRef.current!
    s.start()
    return () => s.stop()
  }, [])

  return (
    <TypingBusContext.Provider value={storeRef.current}>
      {children}
    </TypingBusContext.Provider>
  )
}

function useStore(): TypingStore {
  const s = useContext(TypingBusContext)
  if (!s) throw new Error('useTypingBus must be used inside TypingBusProvider')
  return s
}

/// Imperative API for the realtime bridge to push events.
export function useTypingPush() {
  const store = useStore()
  return (input: {
    conversationId: string
    typerId: string
    typerName: string
  }) => store.push(input)
}

/// Reactive subscription for a conversation thread.
export function useTypers(conversationId: string): TypingEntry[] {
  const store = useStore()
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.snapshot(conversationId),
    () => EMPTY,
  )
}
