/**
 * Tests for the timezone-aware digest day window. The previous
 * implementation used the worker container's local time (UTC), so
 * "today's events" for a user in Africa/Kigali (UTC+2) silently
 * dropped anything scheduled in the Kigali-local 22:00–00:00 slot.
 */

import { describe, expect, it } from 'vitest'
import { userLocalDayBounds } from './processors.js'

describe('userLocalDayBounds', () => {
  it('returns the user-local midnight in UTC for a +offset zone', () => {
    // 2026-04-27 09:00 UTC = 2026-04-27 11:00 in Africa/Kigali.
    // Their day starts at 2026-04-27 00:00 Kigali = 2026-04-26 22:00 UTC.
    const now = new Date('2026-04-27T09:00:00Z')
    const { dayStart, dayEnd } = userLocalDayBounds(now, 'Africa/Kigali')
    expect(dayStart.toISOString()).toBe('2026-04-26T22:00:00.000Z')
    expect(dayEnd.toISOString()).toBe('2026-04-27T22:00:00.000Z')
  })

  it('returns the user-local midnight in UTC for a -offset zone', () => {
    // 2026-04-27 09:00 UTC = 2026-04-27 05:00 in America/New_York (EDT, -4).
    // Their day started at 2026-04-27 00:00 NY = 2026-04-27 04:00 UTC.
    const now = new Date('2026-04-27T09:00:00Z')
    const { dayStart, dayEnd } = userLocalDayBounds(now, 'America/New_York')
    expect(dayStart.toISOString()).toBe('2026-04-27T04:00:00.000Z')
    expect(dayEnd.toISOString()).toBe('2026-04-28T04:00:00.000Z')
  })

  it('handles fractional offsets (Asia/Kolkata is +5:30)', () => {
    // 2026-04-27 22:00 UTC = 2026-04-28 03:30 IST.
    // Their day already started at 2026-04-28 00:00 IST = 2026-04-27 18:30 UTC.
    const now = new Date('2026-04-27T22:00:00Z')
    const { dayStart } = userLocalDayBounds(now, 'Asia/Kolkata')
    expect(dayStart.toISOString()).toBe('2026-04-27T18:30:00.000Z')
  })

  it('falls back to UTC bounds on an invalid IANA string', () => {
    const now = new Date('2026-04-27T09:00:00Z')
    const { dayStart, dayEnd } = userLocalDayBounds(now, 'Not/A_Zone')
    expect(dayStart.toISOString()).toBe('2026-04-27T00:00:00.000Z')
    expect(dayEnd.toISOString()).toBe('2026-04-28T00:00:00.000Z')
  })

  it('returns a 24h window every time', () => {
    const now = new Date('2026-04-27T09:00:00Z')
    for (const tz of ['UTC', 'Africa/Kigali', 'America/Los_Angeles', 'Asia/Tokyo']) {
      const { dayStart, dayEnd } = userLocalDayBounds(now, tz)
      expect(dayEnd.getTime() - dayStart.getTime()).toBe(24 * 60 * 60 * 1000)
    }
  })
})
