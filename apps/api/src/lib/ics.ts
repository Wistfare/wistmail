/// iCalendar (RFC 5545) helpers. Two operations:
///   1. `parseIcs(text)` — extract the first VEVENT's useful fields
///      so the UI can render a real "meeting invite" card instead of
///      the placeholder.
///   2. `buildRsvpReply(...)` — synthesise a METHOD:REPLY VCALENDAR
///      body matching the invite we received, flipping the current
///      user's ATTENDEE PARTSTAT to ACCEPTED / TENTATIVE / DECLINED.
///
/// We use `ical.js` for parsing because it handles real-world invites
/// (TZID, DURATION, unescaping, folded lines) correctly — rolling our
/// own would choke on anything but the trivial cases. For writing we
/// emit a minimal hand-built REPLY — METHOD:REPLY only needs UID +
/// DTSTAMP + ORGANIZER + a single ATTENDEE line, which is easier to
/// get right by hand than configuring ical.js's component tree.

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
