import type { AiProvider } from '../provider'
import type { SummarizeInput, SummarizeOutput } from './types'

const SYSTEM_PROMPT = `Summarize the email in at most 2 sentences. Capture the ask, the decision needed, or the key fact — not the pleasantries. Write in the third person ("Sarah is asking…", "GitHub reports…"). Be concrete: include names, numbers, and dates when present.`

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', maxLength: 280 },
  },
  required: ['summary'],
} as const

export async function summarizeEmail(
  provider: AiProvider,
  model: string,
  input: SummarizeInput,
): Promise<SummarizeOutput> {
  const result = await provider.generate({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Subject: ${input.subject}\n\n${input.body}` },
    ],
    jsonSchema: SCHEMA,
    temperature: 0.2,
    maxTokens: 160,
  })
  const json = result.json as Partial<SummarizeOutput> | undefined
  if (!json || typeof json.summary !== 'string') {
    throw new Error('summarizeEmail: invalid model output')
  }
  return { summary: json.summary.slice(0, 280) }
}
