/**
 * Tests for the tool-calling input shape. The actual dispatch +
 * DB write logic lives in apps/ai-worker/src/processors.ts and is
 * exercised by the worker test suite — here we only verify that
 * the model call returns a clean ToolCall[] from a fake provider.
 */

import { describe, expect, it } from 'vitest'
import type { AiProvider } from '../provider'
import type { GenerateOptions, GenerateResult } from '../types'
import { agenticIngest } from './agentic-ingest'

function fake(toolCalls: GenerateResult['toolCalls']): AiProvider {
  return {
    name: 'fake',
    async generate(opts: GenerateOptions): Promise<GenerateResult> {
      // Sanity-check the caller is sending tools, not jsonSchema.
      // Tool-calling and structured JSON output are exclusive on
      // Ollama — passing both would tell us the agentic path got
      // wired wrong.
      if (opts.jsonSchema) {
        throw new Error('agenticIngest must not pass jsonSchema')
      }
      return { text: '', toolCalls }
    },
  }
}

const baseInput = {
  fromName: 'Sarah Kim',
  fromAddress: 'sarah@x.com',
  subject: 'Sync',
  body: 'see you tomorrow at 11',
  sentAtIso: '2026-04-26T09:00:00Z',
  recipientTimezone: 'Africa/Kigali',
  userDisplayName: 'Veda',
  availableLabels: [
    { id: 'L1', name: 'Work' },
    { id: 'L2', name: 'Personal' },
  ],
}

describe('agenticIngest', () => {
  it('returns the model tool calls verbatim', async () => {
    const r = await agenticIngest(
      fake([
        { name: 'summarize', arguments: { summary: 'Sarah confirms tomorrow 11.' } },
        { name: 'flag_needs_reply', arguments: { reason: 'awaiting confirm', urgency: 0.7 } },
      ]),
      'm',
      baseInput,
    )
    expect(r.toolCalls).toHaveLength(2)
    expect(r.toolCalls[0]!.name).toBe('summarize')
    expect(r.toolCalls[1]!.arguments.urgency).toBe(0.7)
  })

  it('handles an empty tool-call array (model decided nothing applies)', async () => {
    const r = await agenticIngest(fake([]), 'm', baseInput)
    expect(r.toolCalls).toEqual([])
  })

  it('coerces a missing arguments object to {} so dispatch never NPEs', async () => {
    const r = await agenticIngest(
      fake([{ name: 'summarize', arguments: undefined as unknown as Record<string, unknown> }]),
      'm',
      baseInput,
    )
    expect(r.toolCalls[0]!.arguments).toEqual({})
  })
})
