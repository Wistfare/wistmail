/**
 * Day-boundary helpers in arbitrary IANA timezones, using only the
 * Node Intl API — no luxon/date-fns-tz dependency.
 *
 * Used by the Today route to compute "today's events" as the user
 * sees them on the wall clock, not as the server happens to wall-clock
 * them in its own zone. Without this, a meeting at 11am Kigali (UTC+2)
 * may not appear in the Today schedule when the server is on UTC: the
 * 09:00 UTC start lies inside Kigali's "today" but the server
 * computes day boundaries as 00:00 UTC → 24:00 UTC.
 */

/**
 * Returns the wall-clock interpretation of an instant in a timezone,
 * as a Date constructed in the *local* (server) tz. The output isn't
 * a real instant — it's only useful as an arithmetic intermediate.
 */
function wallClock(instant: Date, timeZone: string): Date {
  return new Date(instant.toLocaleString('en-US', { timeZone }))
}

/**
 * Given an instant `now`, return the UTC instant that corresponds to
 * midnight on `now`'s calendar date in the supplied IANA timezone.
 *
 * Algorithm: get the wall-clock-in-tz for `now`, zero its time of day,
 * then iterate to find the UTC instant whose wall-clock-in-tz matches
 * that zeroed wall clock. One pass converges for fixed-offset zones;
 * two covers any DST transition that could land midway.
 */
export function startOfDayInTz(now: Date, timeZone: string): Date {
  const wall = wallClock(now, timeZone)
  wall.setHours(0, 0, 0, 0)
  const targetMs = wall.getTime()
  let candidateUtc = targetMs
  for (let i = 0; i < 3; i++) {
    const drift = targetMs - wallClock(new Date(candidateUtc), timeZone).getTime()
    if (drift === 0) break
    candidateUtc += drift
  }
  return new Date(candidateUtc)
}

/** Convenience: start of *next* day in tz. End-exclusive boundary. */
export function startOfNextDayInTz(now: Date, timeZone: string): Date {
  const dayStart = startOfDayInTz(now, timeZone)
  return new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
}

/**
 * Validate that `tz` is an IANA zone the runtime understands. Same
 * check the timezone-tracker middleware uses; lifted here so the
 * Today route can fall back gracefully when a header is missing or
 * malformed instead of throwing inside DateTimeFormat.
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z_+\-/0-9]+$/.test(tz)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
