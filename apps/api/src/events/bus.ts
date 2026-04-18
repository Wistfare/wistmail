import { EventEmitter } from 'node:events'
import type { RealtimeEvent } from './types.js'

/**
 * In-process pub/sub for realtime events. One singleton per process.
 *
 * For multi-instance deployments, swap the implementation with a Redis-backed
 * publisher (ioredis is already a dependency) — the public API stays the same.
 */
class EventBus {
  private readonly emitter = new EventEmitter()

  constructor() {
    // No global cap; we want one listener per active WS connection.
    this.emitter.setMaxListeners(0)
  }

  /**
   * Publish an event for the user. Listeners registered via `subscribe(userId)`
   * for the matching userId will receive it.
   */
  publish(event: RealtimeEvent): void {
    this.emitter.emit(event.userId, event)
  }

  /**
   * Subscribe to events for a user. Returns an unsubscribe function.
   */
  subscribe(userId: string, handler: (event: RealtimeEvent) => void): () => void {
    this.emitter.on(userId, handler)
    return () => {
      this.emitter.off(userId, handler)
    }
  }

  /**
   * Count of active listeners for a user — used by tests.
   */
  listenerCount(userId: string): number {
    return this.emitter.listenerCount(userId)
  }
}

export const eventBus = new EventBus()
export type { RealtimeEvent } from './types.js'
