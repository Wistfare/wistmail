import type { AiProvider } from '../provider'
import type { ExtractMeetingInput, ExtractMeetingOutput } from './types'

const SYSTEM_PROMPT = `Extract a single meeting from the email below if (and only if) the sender clearly proposes or confirms one.

Return:
  - hasMeeting: true ONLY if the email refers to a specific scheduled time. A vague "let's meet sometime" is FALSE. A reminder of an already-scheduled time IS true.
  - title: short, action-form (e.g. "Investor sync"). Default to the email subject if nothing better presents itself.
  - startAt: ISO 8601 with the *exact timezone offset the sender stated*. If the email says "11 AM Kigali time" and Kigali is UTC+02:00, return "...T11:00:00+02:00". If only a wall-clock time is given without zone, omit the offset and trust the recipient's local zone interpretation downstream — but only do this when the email plainly implies the recipient's local zone (rare). When ambiguous, return null.
  - endAt: ISO 8601. If the sender states a duration, add it. Otherwise default to startAt + 1 hour.
  - location: the physical location, link, or room. Null when not stated.
  - attendees: email addresses or display names mentioned. The sender + the email's primary recipient are NOT attendees here — the caller adds them.
  - confidence: 0..1. Score guidance:
      0.9–1.0  explicit ISO datetime, sender confirms it ("Confirmed for tomorrow at 11 AM EST")
      0.7–0.9  natural-language but unambiguous ("tomorrow at 11", "Monday 3pm")
      0.5–0.7  partial ("next week", with a specific day)
      0.0–0.4  no real meeting, vague, or just a topic discussion

Rules:
  - DO NOT invent a time. If the email lacks a time, set hasMeeting=false and confidence ≤ 0.2.
  - DO NOT pull dates out of email signatures, footers, "Sent on …" headers, or quoted earlier threads. Only the new content of THIS message counts.
  - "Tomorrow", "today", "this Friday" are valid — caller resolves them against the email's sentAt.

If hasMeeting is false, leave the other fields null/empty.`

const SCHEMA = {
  type: 'object',
  properties: {
    hasMeeting: { type: 'boolean' },
    title: { type: ['string', 'null'], maxLength: 200 },
    startAt: { type: ['string', 'null'] },
    endAt: { type: ['string', 'null'] },
    location: { type: ['string', 'null'], maxLength: 500 },
    attendees: {
      type: 'array',
      items: { type: 'string', maxLength: 200 },
      maxItems: 20,
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['hasMeeting', 'confidence'],
} as const

export async function extractMeeting(
  provider: AiProvider,
  model: string,
  input: ExtractMeetingInput,
): Promise<ExtractMeetingOutput> {
  const senderLabel = input.fromName
    ? `${input.fromName} <${input.fromAddress}>`
    : input.fromAddress
  const userText =
    `Sender: ${senderLabel}\n` +
    `Email sent at (ISO): ${input.sentAtIso}\n` +
    `Recipient timezone (IANA, fallback for ambiguous times): ${input.recipientTimezone}\n` +
    `Subject: ${input.subject}\n\n` +
    input.body

  const result = await provider.generate({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ],
    jsonSchema: SCHEMA,
    temperature: 0.1,
    maxTokens: 400,
  })

  const json = result.json as Record<string, unknown> | undefined
  if (!json || typeof json.hasMeeting !== 'boolean') {
    return { hasMeeting: false, confidence: 0 }
  }

  const conf = clamp01(typeof json.confidence === 'number' ? json.confidence : 0)
  if (!json.hasMeeting) {
    return { hasMeeting: false, confidence: conf }
  }

  return {
    hasMeeting: true,
    title: typeof json.title === 'string' ? json.title.slice(0, 200) : null,
    startAt: typeof json.startAt === 'string' ? json.startAt : null,
    endAt: typeof json.endAt === 'string' ? json.endAt : null,
    location:
      typeof json.location === 'string' ? json.location.slice(0, 500) : null,
    attendees: Array.isArray(json.attendees)
      ? (json.attendees as unknown[])
          .filter((v): v is string => typeof v === 'string')
          .slice(0, 20)
      : [],
    confidence: conf,
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(1, n))
}
