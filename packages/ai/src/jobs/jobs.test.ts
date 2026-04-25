import { describe, expect, it } from 'vitest'
import type { AiProvider } from '../provider'
import type { GenerateOptions, GenerateResult } from '../types'
import { classifyNeedsReply } from './classify-needs-reply'
import { autoLabel } from './auto-label'
import { draftReply } from './draft-reply'
import { todayDigest } from './today-digest'

function fake(out: unknown): AiProvider {
  return {
    name: 'fake',
    async generate(_opts: GenerateOptions): Promise<GenerateResult> {
      return { text: JSON.stringify(out), json: out }
    },
  }
}

describe('classifyNeedsReply', () => {
  it('returns the model decision and clamps reason length', async () => {
    const r = await classifyNeedsReply(
      fake({ needsReply: true, reason: 'a'.repeat(120) }),
      'm',
      { fromAddress: 'a@b.com', subject: 's', body: 'b' },
    )
    expect(r.needsReply).toBe(true)
    expect(r.reason.length).toBe(80)
  })

  it('throws on malformed output', async () => {
    await expect(
      classifyNeedsReply(
        fake({ needsReply: 'yes', reason: 1 }),
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
  it('passes through structured digest fields', async () => {
    const out = {
      briefing: 'Two reviews, then deep work after lunch.',
      priorities: [{ kind: 'email', id: 'e1', reason: 'awaiting your sign-off' }],
      focusBlocks: [{ startAt: '14:00', endAt: '16:00', label: 'Deep work' }],
    }
    const r = await todayDigest(fake(out), 'm', {
      userDisplayName: 'V',
      pendingEmails: [],
      todayEvents: [],
      openTasks: [],
    })
    expect(r).toEqual(out)
  })
})
