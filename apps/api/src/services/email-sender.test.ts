/// Pure-logic tests for the EmailSender state machine. The integration
/// path (DB + mail-engine HTTP) is covered separately. Here we lock
/// down the things you can break by accident:
///   - retry backoff schedule (linear-then-exponential, exhausts at MAX)
///   - status enum stability (clients pin to these literals)

import { describe, expect, it } from 'vitest'
import {
  EMAIL_STATUS,
  MAX_SEND_ATTEMPTS,
  nextAttemptAt,
} from './email-sender.js'

describe('EmailSender state machine', () => {
  it('exposes the documented status enum literals', () => {
    expect(EMAIL_STATUS.Idle).toBe('idle')
    expect(EMAIL_STATUS.Sending).toBe('sending')
    expect(EMAIL_STATUS.Sent).toBe('sent')
    expect(EMAIL_STATUS.Failed).toBe('failed')
    expect(EMAIL_STATUS.RateLimited).toBe('rate_limited')
  })

  describe('nextAttemptAt backoff', () => {
    const base = new Date('2026-01-01T00:00:00Z')

    it('returns a future date for the first attempt window', () => {
      const next = nextAttemptAt(0, base)
      expect(next).not.toBeNull()
      expect(next!.getTime()).toBe(base.getTime() + 1_000)
    })

    it('expands the window on each subsequent attempt', () => {
      const a = nextAttemptAt(0, base)!
      const b = nextAttemptAt(1, base)!
      const c = nextAttemptAt(2, base)!
      expect(b.getTime()).toBeGreaterThan(a.getTime())
      expect(c.getTime()).toBeGreaterThan(b.getTime())
    })

    it('returns null after MAX_SEND_ATTEMPTS', () => {
      expect(nextAttemptAt(MAX_SEND_ATTEMPTS, base)).toBeNull()
      expect(nextAttemptAt(MAX_SEND_ATTEMPTS + 5, base)).toBeNull()
    })

    it('produces a strictly increasing series across the schedule', () => {
      // Touch every entry so future edits to the schedule still
      // satisfy the monotonic invariant the dispatcher depends on.
      let prev = -Infinity
      for (let i = 0; i < MAX_SEND_ATTEMPTS; i++) {
        const next = nextAttemptAt(i, base)
        expect(next).not.toBeNull()
        expect(next!.getTime()).toBeGreaterThan(prev)
        prev = next!.getTime()
      }
    })
  })
})
