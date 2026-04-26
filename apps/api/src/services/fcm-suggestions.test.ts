/// Tests the data-only follow-up FCM payload that ships AI-generated
/// reply suggestions. Uses the pure `buildEmailSuggestionsPayload`
/// helper so we lock in the wire format without standing up
/// firebase-admin or a Postgres connection. Focus-mode / channel-pref
/// gating is covered by the `shouldDeliverPush` tests in `fcm.test.ts`
/// — the same gate runs in front of `sendEmailSuggestionsUpdate`.

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { buildEmailSuggestionsPayload } from './fcm.js'

const ORIGINAL_JWT = process.env.JWT_SECRET
beforeEach(() => {
  process.env.JWT_SECRET = 'integration-test-secret'
})
afterEach(() => {
  if (ORIGINAL_JWT !== undefined) process.env.JWT_SECRET = ORIGINAL_JWT
  else delete process.env.JWT_SECRET
})

describe('buildEmailSuggestionsPayload', () => {
  it('marks the update with type=email.new.update + a tag matching the email id', () => {
    const payload = buildEmailSuggestionsPayload({
      userId: 'u_1',
      emailId: 'eml_abc',
      suggestions: [
        { id: 's1', tone: 'concise', body: 'Sounds good.' },
        { id: 's2', tone: 'warm', body: 'Thanks for the heads-up!' },
      ],
    })
    // Silent update — no `notification` block.
    expect(payload).not.toHaveProperty('notification')
    const data = payload.data as Record<string, string>
    expect(data.type).toBe('email.new.update')
    expect(data.emailId).toBe('eml_abc')
    expect(data.tag).toBe('email-eml_abc')
  })

  it('JSON-encodes the suggestions array (FCM data values must be strings)', () => {
    const payload = buildEmailSuggestionsPayload({
      userId: 'u_1',
      emailId: 'eml_abc',
      suggestions: [
        { id: 's1', tone: 'concise', body: 'one' },
        { id: 's2', tone: 'warm', body: 'two' },
      ],
    })
    const data = payload.data as Record<string, string>
    expect(typeof data.suggestions).toBe('string')
    const parsed = JSON.parse(data.suggestions)
    expect(parsed).toEqual([
      { id: 's1', tone: 'concise', body: 'one' },
      { id: 's2', tone: 'warm', body: 'two' },
    ])
  })

  it('embeds reply + read action tokens', () => {
    const payload = buildEmailSuggestionsPayload({
      userId: 'u_1',
      emailId: 'eml_abc',
      suggestions: [],
    })
    const data = payload.data as Record<string, string>
    expect(typeof data.actionTokenReply).toBe('string')
    expect(typeof data.actionTokenRead).toBe('string')
    // Wire format is body.signature — base64url segments.
    expect(data.actionTokenReply).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('still produces a valid payload when JWT_SECRET is missing (tokens omitted)', () => {
    delete process.env.JWT_SECRET
    const payload = buildEmailSuggestionsPayload({
      userId: 'u_1',
      emailId: 'eml_abc',
      suggestions: [{ id: 's1', tone: 'concise', body: 'k' }],
    })
    const data = payload.data as Record<string, string>
    // Tokens absent — receivers fall back to the in-app reply path.
    expect(data.actionTokenReply).toBeUndefined()
    expect(data.actionTokenRead).toBeUndefined()
    // But the rest of the payload is intact.
    expect(data.type).toBe('email.new.update')
    expect(data.emailId).toBe('eml_abc')
  })
})
