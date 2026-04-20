/// iCalendar (RFC 5545) helpers. Three operations:
///   1. `parseIcs(text)` — synchronous parse; used in trusted paths
///      where the input is our own generated VCALENDAR.
///   2. `parseIcsSafely(text)` — runs parseIcs in a worker thread
///      with a hard timeout. Use this for ANY user-supplied bytes
///      (inbound invites, attachment RSVP reads): ical.js has a rich
///      grammar and a hostile invite could trigger a
///      catastrophic-backtracking regex path that would stall the
///      main request loop. The worker cap contains that blast radius.
///   3. `buildRsvpReply(...)` — synthesise a METHOD:REPLY VCALENDAR
///      body matching the invite we received, flipping the current
///      user's ATTENDEE PARTSTAT to ACCEPTED / TENTATIVE / DECLINED.
///
/// We use `ical.js` for parsing because it handles real-world invites
/// (TZID, DURATION, unescaping, folded lines) correctly — rolling our
/// own would choke on anything but the trivial cases. For writing we
/// emit a minimal hand-built REPLY — METHOD:REPLY only needs UID +
/// DTSTAMP + ORGANIZER + a single ATTENDEE line, which is easier to
/// get right by hand than configuring ical.js's component tree.

import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
// ical.js ships its own types but the public API surface we touch
// (Component, parse, property accessors) is not strictly typed end to
// end; we interop via `any` and narrow at call sites.
import ICAL from 'ical.js'

export type RsvpResponse = 'accept' | 'tentative' | 'decline'

export interface ParsedIcs {
  /// Stable UID from the invite. Required — REPLY must echo it.
  uid: string
  method: string | null
  summary: string | null
  description: string | null
  location: string | null
  /// ISO strings for the UI. We lose TZID information in the stringified
  /// form; if the UI needs timezone display we can revisit.
  startAt: string | null
  endAt: string | null
  allDay: boolean
  organizer: { email: string; name: string | null } | null
  attendees: Array<{ email: string; name: string | null; rsvp: boolean }>
  sequence: number
}

/// Parse raw ICS text and return the first VEVENT. Returns null if
/// the bytes aren't valid iCalendar or there's no VEVENT inside —
/// callers should treat that as "not an invite" and fall back to a
/// generic attachment chip.
export function parseIcs(text: string): ParsedIcs | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jcal = (ICAL as any).parse(text)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = new (ICAL as any).Component(jcal)
    const method = comp.getFirstPropertyValue('method') ?? null
    const vevent = comp.getFirstSubcomponent('vevent')
    if (!vevent) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dtstart = vevent.getFirstProperty('dtstart') as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dtend = vevent.getFirstProperty('dtend') as any
    const allDay = dtstart?.type === 'date'

    const toIso = (prop: unknown): string | null => {
      if (!prop) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = (prop as any).getFirstValue?.()
      if (!v) return null
      try {
        return v.toJSDate().toISOString()
      } catch {
        return null
      }
    }

    const organizerProp = vevent.getFirstProperty('organizer')
    const organizer = organizerProp
      ? {
          email: String(organizerProp.getFirstValue() || '').replace(/^mailto:/i, ''),
          name: (organizerProp.getParameter('cn') as string | null) ?? null,
        }
      : null

    const attendeeProps = vevent.getAllProperties('attendee') ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attendees = attendeeProps.map((p: any) => ({
      email: String(p.getFirstValue() || '').replace(/^mailto:/i, ''),
      name: (p.getParameter('cn') as string | null) ?? null,
      rsvp: (p.getParameter('rsvp') as string | null)?.toUpperCase() === 'TRUE',
    }))

    return {
      uid: String(vevent.getFirstPropertyValue('uid') ?? ''),
      method: method ? String(method) : null,
      summary: (vevent.getFirstPropertyValue('summary') as string | null) ?? null,
      description: (vevent.getFirstPropertyValue('description') as string | null) ?? null,
      location: (vevent.getFirstPropertyValue('location') as string | null) ?? null,
      startAt: toIso(dtstart),
      endAt: toIso(dtend),
      allDay,
      organizer,
      attendees,
      sequence: Number(vevent.getFirstPropertyValue('sequence') ?? 0),
    }
  } catch (err) {
    console.warn('[ics] parse failed:', err)
    return null
  }
}

const PARTSTAT_FOR: Record<RsvpResponse, string> = {
  accept: 'ACCEPTED',
  tentative: 'TENTATIVE',
  decline: 'DECLINED',
}

/// Build a METHOD:REPLY VCALENDAR the organizer's client will recognise
/// as the current user accepting / declining. Follows RFC 5546 §3.2.3 —
/// the reply must echo UID, SEQUENCE, DTSTART, ORGANIZER, and include
/// one ATTENDEE with the new PARTSTAT.
///
/// `attendeeEmail` is the user's own address (the mailbox that received
/// the invite); `attendeeName` is optional display name.
export function buildRsvpReply(opts: {
  invite: ParsedIcs
  attendeeEmail: string
  attendeeName?: string | null
  response: RsvpResponse
}): string {
  const { invite, attendeeEmail, response } = opts
  const attendeeName = opts.attendeeName?.trim() || null
  const partstat = PARTSTAT_FOR[response]
  const now = new Date()
  const dtstamp = formatIcsUtc(now)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WistMail//RSVP 1.0//EN',
    'METHOD:REPLY',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(invite.uid)}`,
    `DTSTAMP:${dtstamp}`,
    `SEQUENCE:${invite.sequence}`,
  ]

  if (invite.startAt) {
    lines.push(`DTSTART:${formatIcsUtc(new Date(invite.startAt))}`)
  }
  if (invite.endAt) {
    lines.push(`DTEND:${formatIcsUtc(new Date(invite.endAt))}`)
  }
  if (invite.summary) {
    lines.push(`SUMMARY:${escapeIcs(invite.summary)}`)
  }
  if (invite.organizer?.email) {
    const cn = invite.organizer.name ? `;CN=${escapeIcsParam(invite.organizer.name)}` : ''
    lines.push(`ORGANIZER${cn}:mailto:${invite.organizer.email}`)
  }

  const cn = attendeeName ? `;CN=${escapeIcsParam(attendeeName)}` : ''
  lines.push(
    `ATTENDEE${cn};PARTSTAT=${partstat};RSVP=FALSE:mailto:${attendeeEmail}`,
  )

  lines.push('END:VEVENT', 'END:VCALENDAR')
  // ICS is CRLF-delimited.
  return lines.join('\r\n') + '\r\n'
}

/// Format a Date as an ICS UTC timestamp — yyyymmddThhmmssZ.
function formatIcsUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/// RFC 5545 §3.3.11 text value escaping — commas, semicolons,
/// backslashes, and newlines must be backslash-escaped.
function escapeIcs(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/// RFC 5545 §3.2 parameter-value escaping — quotes get doubled,
/// colons/commas/semicolons force quoting.
function escapeIcsParam(v: string): string {
  const needsQuotes = /[:;,]/.test(v)
  const safe = v.replace(/"/g, '')
  return needsQuotes ? `"${safe}"` : safe
}

/// Default timeout for worker-thread parses. iCalendar docs of any
/// realistic size (well-formed RSVP: <10 KB, heavy invites from
/// Outlook with HTML-escaped descriptions: <50 KB) parse in under
/// 50 ms. 1.5 s gives a 30× margin for real traffic while still
/// containing any hostile payload's blast radius.
const DEFAULT_PARSE_TIMEOUT_MS = 1500

/// Absolute cap on input size we'll even hand to the worker. Real
/// invites are <100 KB; 256 KB is a comfortable margin over that
/// and small enough that ical.js can't amplify bad input into a
/// meaningful event-loop stall even if the worker is slow to
/// terminate.
const MAX_ICS_BYTES = 256 * 1024

/// Resolve the compiled ICS worker path. We accept both `.ts`
/// (running via tsx in dev) and `.js` (after tsc compile) — the
/// fileURLToPath stays identical.
const WORKER_URL = new URL('./ics-worker.js', import.meta.url)

/// Run `parseIcs` off the main thread. Returns null on any failure
/// (oversize input, worker error, timeout, unparseable bytes). The
/// sync `parseIcs` is still exported for trusted paths (e.g. parsing
/// our own freshly-built REPLY to validate shape) where the timeout
/// and spawn cost aren't justified.
export async function parseIcsSafely(
  text: string,
  timeoutMs: number = DEFAULT_PARSE_TIMEOUT_MS,
): Promise<ParsedIcs | null> {
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_ICS_BYTES) {
    return null
  }
  return new Promise<ParsedIcs | null>((resolve) => {
    let settled = false
    const worker = new Worker(fileURLToPath(WORKER_URL), {
      workerData: text,
    })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      console.warn('[ics] parse timeout — terminating worker')
      worker.terminate().catch(() => {})
      resolve(null)
    }, timeoutMs)

    worker.once('message', (msg: { ok: boolean; result?: ParsedIcs | null }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate().catch(() => {})
      resolve(msg.ok ? msg.result ?? null : null)
    })
    worker.once('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate().catch(() => {})
      console.warn('[ics] worker error:', err)
      resolve(null)
    })
    worker.once('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        console.warn(`[ics] worker exited with code ${code}`)
      }
      resolve(null)
    })
  })
}
