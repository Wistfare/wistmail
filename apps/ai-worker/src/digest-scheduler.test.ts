/**
 * Pure-logic tests for the digest scheduler. localHour / localDay are
 * the entire timezone-correctness contract — if these are right, the
 * scheduler fires the right user at the right wall time. The
 * tickDigestSchedule integration path is covered separately by the
 * api/db tests that exercise the whole worker.
 */

import { describe, expect, it } from 'vitest'
import { localDay, localHour } from './digest-scheduler.js'

describe('localHour', () => {
  it('returns the local clock hour for an IANA TZ', () => {
    // 2026-04-26 09:00 UTC → 11:00 in Africa/Kigali (UTC+2, no DST).
    const utc = new Date('2026-04-26T09:00:00Z')
    expect(localHour(utc, 'Africa/Kigali')).toBe(11)
  })

  it('handles fractional offsets (Asia/Kolkata is +5:30)', () => {
    // 2026-04-26 22:00 UTC → 03:30 next day local. Hour = 3.
    const utc = new Date('2026-04-26T22:00:00Z')
    expect(localHour(utc, 'Asia/Kolkata')).toBe(3)
  })

  it('handles DST transitions (America/New_York April → EDT, UTC-4)', () => {
    // 04:00 UTC in April = 00:00 EDT — exactly the digest window.
    const utc = new Date('2026-04-26T04:00:00Z')
    expect(localHour(utc, 'America/New_York')).toBe(0)
  })

  it('returns 99 (no-window) for a malformed TZ — never fires the digest', () => {
    const utc = new Date('2026-04-26T04:00:00Z')
    expect(localHour(utc, 'Not/A_Zone')).toBe(99)
  })
})

describe('localDay', () => {
  it('returns YYYY-MM-DD in the user TZ even when UTC has rolled over', () => {
    // 2026-04-26 23:30 in Africa/Kigali (UTC+2) is 21:30 UTC the same day.
    // Verify that TZs ahead of UTC return tomorrow's date when UTC is
    // still on the prior day.
    const utc = new Date('2026-04-26T23:30:00Z')
    expect(localDay(utc, 'Africa/Kigali')).toBe('2026-04-27')
  })

  it('returns yesterday for a TZ behind UTC', () => {
    const utc = new Date('2026-04-26T01:00:00Z')
    expect(localDay(utc, 'America/Los_Angeles')).toBe('2026-04-25')
  })

  it('falls back to UTC date on malformed TZ', () => {
    const utc = new Date('2026-04-26T04:00:00Z')
    expect(localDay(utc, 'Not/A_Zone')).toBe('2026-04-26')
  })
})
