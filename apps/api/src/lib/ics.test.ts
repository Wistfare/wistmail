import { describe, expect, it } from 'vitest'
import { buildRsvpReply, parseIcs } from './ics.js'

const INVITE = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Test//EN',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:abc-123@example.com',
  'DTSTAMP:20260420T100000Z',
  'DTSTART:20260425T150000Z',
  'DTEND:20260425T160000Z',
  'SUMMARY:Project sync',
  'LOCATION:Zoom',
  'DESCRIPTION:Weekly review.',
  'SEQUENCE:2',
  'ORGANIZER;CN=Alice:mailto:alice@example.com',
  'ATTENDEE;CN=Bob;RSVP=TRUE:mailto:bob@example.com',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseIcs', () => {
  it('returns the first VEVENT with useful fields', () => {
    const p = parseIcs(INVITE)
    expect(p).not.toBeNull()
    expect(p!.uid).toBe('abc-123@example.com')
    expect(p!.method).toBe('REQUEST')
    expect(p!.summary).toBe('Project sync')
    expect(p!.location).toBe('Zoom')
    expect(p!.startAt).toBe('2026-04-25T15:00:00.000Z')
    expect(p!.endAt).toBe('2026-04-25T16:00:00.000Z')
    expect(p!.organizer).toEqual({ email: 'alice@example.com', name: 'Alice' })
    expect(p!.sequence).toBe(2)
    expect(p!.attendees).toHaveLength(1)
    expect(p!.attendees[0].email).toBe('bob@example.com')
    expect(p!.attendees[0].rsvp).toBe(true)
  })

  it('returns null for garbage input', () => {
    expect(parseIcs('not an ics')).toBeNull()
  })
})

describe('buildRsvpReply', () => {
  it('produces a METHOD:REPLY echoing UID/SEQUENCE with PARTSTAT', () => {
    const invite = parseIcs(INVITE)!
    const reply = buildRsvpReply({
      invite,
      attendeeEmail: 'bob@example.com',
      attendeeName: 'Bob',
      response: 'accept',
    })
    expect(reply).toContain('METHOD:REPLY')
    expect(reply).toContain('UID:abc-123@example.com')
    expect(reply).toContain('SEQUENCE:2')
    expect(reply).toContain('ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:bob@example.com')
    expect(reply).toContain('ORGANIZER;CN=Alice:mailto:alice@example.com')
    expect(reply).toMatch(/\r\n$/)
  })

  it('maps decline to PARTSTAT=DECLINED', () => {
    const invite = parseIcs(INVITE)!
    const reply = buildRsvpReply({
      invite,
      attendeeEmail: 'bob@example.com',
      response: 'decline',
    })
    expect(reply).toContain('PARTSTAT=DECLINED')
  })

  it('maps tentative to PARTSTAT=TENTATIVE', () => {
    const invite = parseIcs(INVITE)!
    const reply = buildRsvpReply({
      invite,
      attendeeEmail: 'bob@example.com',
      response: 'tentative',
    })
    expect(reply).toContain('PARTSTAT=TENTATIVE')
  })

  it('escapes text values per RFC 5545', () => {
    const invite = {
      ...parseIcs(INVITE)!,
      summary: 'Sprint; demo, with colons',
    }
    const reply = buildRsvpReply({
      invite,
      attendeeEmail: 'bob@example.com',
      response: 'accept',
    })
    expect(reply).toContain('SUMMARY:Sprint\\; demo\\, with colons')
  })
})
