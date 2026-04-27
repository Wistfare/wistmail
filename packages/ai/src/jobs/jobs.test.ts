import { describe, expect, it } from 'vitest'
import type { AiProvider } from '../provider'
import type { GenerateOptions, GenerateResult } from '../types'
import { classifyNeedsReply } from './classify-needs-reply'
import { autoLabel } from './auto-label'
import { draftReply } from './draft-reply'
import { todayDigest } from './today-digest'
import { deriveDisplayName } from './derive-display-name'
import { extractMeeting } from './extract-meeting'

function fake(out: unknown): AiProvider {
  return {
    name: 'fake',
    async generate(_opts: GenerateOptions): Promise<GenerateResult> {
      return { text: JSON.stringify(out), json: out }
    },
  }
}

describe('classifyNeedsReply', () => {
  it('returns the model decision, clamps reason, clamps urgency to [0,1]', async () => {
    const r = await classifyNeedsReply(
      fake({ needsReply: true, reason: 'a'.repeat(120), urgency: 1.5 }),
      'm',
      { fromAddress: 'a@b.com', subject: 's', body: 'b' },
    )
    expect(r.needsReply).toBe(true)
    expect(r.reason.length).toBe(80)
    expect(r.urgency).toBe(1)
  })

  it('caps urgency at 0.2 when needsReply is false (model contract enforcement)', async () => {
    // The prompt says "when needsReply is false, urgency must be ≤ 0.2".
    // If the model violates that, the wrapper clamps it — otherwise a
    // chatty newsletter could still float into priorities.
    const r = await classifyNeedsReply(
      fake({ needsReply: false, reason: 'newsletter', urgency: 0.9 }),
      'm',
      { fromAddress: 'a@b.com', subject: 's', body: 'b' },
    )
    expect(r.urgency).toBe(0.2)
  })

  it('throws on malformed output', async () => {
    await expect(
      classifyNeedsReply(
        fake({ needsReply: 'yes', reason: 1, urgency: 0.5 }),
        'm',
        { fromAddress: 'a@b.com', subject: 's', body: 'b' },
      ),
    ).rejects.toThrow(/invalid model output/)
  })

  it('throws when urgency is missing', async () => {
    await expect(
      classifyNeedsReply(
        fake({ needsReply: true, reason: 'r' }),
        'm',
        { fromAddress: 'a@b.com', subject: 's', body: 'b' },
      ),
    ).rejects.toThrow(/invalid model output/)
  })
})

describe('autoLabel', () => {
  it('drops labels not in the available set', async () => {
    const r = await autoLabel(
      fake({
        labels: [
          { id: 'L1', confidence: 0.9 },
          { id: 'GHOST', confidence: 0.99 },
        ],
      }),
      'm',
      {
        fromAddress: 'a@b.com',
        subject: 's',
        body: 'b',
        availableLabels: [{ id: 'L1', name: 'Work' }],
      },
    )
    expect(r.labels).toEqual([{ id: 'L1', confidence: 0.9 }])
  })

  it('short-circuits when there are no available labels', async () => {
    const r = await autoLabel(
      // Provider would never be called; passing one that throws to confirm.
      {
        name: 'x',
        async generate() {
          throw new Error('should not run')
        },
      },
      'm',
      { fromAddress: 'a@b.com', subject: 's', body: 'b', availableLabels: [] },
    )
    expect(r.labels).toEqual([])
  })
})

describe('draftReply', () => {
  it('keeps only valid tones and clamps body length', async () => {
    const r = await draftReply(
      fake({
        drafts: [
          { tone: 'concise', body: 'hi', score: 0.8 },
          { tone: 'evil', body: 'no', score: 0.2 },
          { tone: 'warm', body: 'x'.repeat(2000), score: 0.7 },
        ],
      }),
      'm',
      {
        fromName: 'Sarah',
        fromAddress: 's@b.com',
        subject: 's',
        body: 'b',
        userDisplayName: 'Veda',
      },
    )
    expect(r.drafts.map((d) => d.tone)).toEqual(['concise', 'warm'])
    expect(r.drafts[1]!.body.length).toBe(1200)
  })
})

describe('todayDigest', () => {
  it('sorts priorities by urgency descending and trims to 5', async () => {
    const out = {
      briefing: 'Two reviews, then deep work after lunch.',
      priorities: [
        { kind: 'email', id: 'e1', reason: 'low', urgency: 0.2 },
        { kind: 'email', id: 'e2', reason: 'block', urgency: 0.9 },
        { kind: 'task', id: 't1', reason: 'mid', urgency: 0.5 },
        { kind: 'event', id: 'v1', reason: 'mtg', urgency: 0.7 },
        { kind: 'email', id: 'e3', reason: 'note', urgency: 0.1 },
        { kind: 'email', id: 'e4', reason: 'noise', urgency: 0.05 },
      ],
      focusBlocks: [{ startAt: '14:00', endAt: '16:00', label: 'Deep work' }],
    }
    const r = await todayDigest(fake(out), 'm', {
      userDisplayName: 'V',
      pendingEmails: [],
      todayEvents: [],
      openTasks: [],
    })
    expect(r.priorities.map((p) => p.id)).toEqual(['e2', 'v1', 't1', 'e1', 'e3'])
    expect(r.priorities).toHaveLength(5)
  })

  it('clamps a missing or out-of-range urgency to a sane value', async () => {
    const r = await todayDigest(
      fake({
        briefing: 'b',
        priorities: [
          { kind: 'email', id: 'e1', reason: 'r', urgency: 2 },
          { kind: 'email', id: 'e2', reason: 'r' }, // missing urgency
        ],
        focusBlocks: [],
      }),
      'm',
      { userDisplayName: 'V', pendingEmails: [], todayEvents: [], openTasks: [] },
    )
    expect(r.priorities[0]!.urgency).toBe(1)
    // Missing urgency defaults to 0.5 — moderate, not at top, not at bottom.
    expect(r.priorities[1]!.urgency).toBe(0.5)
  })
})

describe('deriveDisplayName', () => {
  it('passes through valid model output', async () => {
    const r = await deriveDisplayName(
      fake({ name: 'Nsengimana Veda Dom', confidence: 0.62 }),
      'm',
      { localPart: 'nsengimanavedadom', domain: 'gmail.com' },
    )
    expect(r.name).toBe('Nsengimana Veda Dom')
    expect(r.confidence).toBe(0.62)
  })

  it('clamps confidence to [0, 1] and truncates name to 255', async () => {
    const long = 'A'.repeat(500)
    const r = await deriveDisplayName(
      fake({ name: long, confidence: 5 }),
      'm',
      { localPart: 'x', domain: 'y' },
    )
    expect(r.name.length).toBe(255)
    expect(r.confidence).toBe(1)
  })

  it('throws on missing fields', async () => {
    await expect(
      deriveDisplayName(
        fake({ name: 'X' }),
        'm',
        { localPart: 'a', domain: 'b' },
      ),
    ).rejects.toThrow(/invalid model output/)
  })
})

describe('extractMeeting', () => {
  const baseInput = {
    fromName: 'Sarah Kim',
    fromAddress: 'sarah@x.com',
    subject: 'Sync',
    body: 'see you tomorrow at 11',
    sentAtIso: '2026-04-26T09:00:00Z',
    recipientTimezone: 'Africa/Kigali',
  }

  it('passes through a confident model output', async () => {
    const r = await extractMeeting(
      fake({
        hasMeeting: true,
        title: 'Sync',
        startAt: '2026-04-27T11:00:00+02:00',
        endAt: '2026-04-27T12:00:00+02:00',
        location: 'Zoom',
        attendees: ['joel@x.com'],
        confidence: 0.9,
      }),
      'm',
      baseInput,
    )
    expect(r.hasMeeting).toBe(true)
    expect(r.startAt).toBe('2026-04-27T11:00:00+02:00')
    expect(r.confidence).toBe(0.9)
  })

  it('returns hasMeeting=false when the model says no', async () => {
    const r = await extractMeeting(
      fake({ hasMeeting: false, confidence: 0.05 }),
      'm',
      baseInput,
    )
    expect(r.hasMeeting).toBe(false)
    expect(r.confidence).toBe(0.05)
  })

  it('clamps confidence and trims long fields', async () => {
    const r = await extractMeeting(
      fake({
        hasMeeting: true,
        title: 'A'.repeat(500),
        location: 'L'.repeat(1000),
        confidence: 7,
        attendees: Array.from({ length: 100 }, (_, i) => `u${i}@x.com`),
      }),
      'm',
      baseInput,
    )
    expect(r.title!.length).toBeLessThanOrEqual(200)
    expect(r.location!.length).toBeLessThanOrEqual(500)
    expect(r.attendees!.length).toBe(20)
    expect(r.confidence).toBe(1)
  })

  it('returns a safe default on garbage model output', async () => {
    const r = await extractMeeting(fake({}), 'm', baseInput)
    expect(r).toEqual({ hasMeeting: false, confidence: 0 })
  })
})
