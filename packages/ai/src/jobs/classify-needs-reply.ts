import type { AiProvider } from '../provider'
import type { ClassifyInput, ClassifyOutput } from './types'

const SYSTEM_PROMPT = `You are an email triage assistant. Decide whether the recipient needs to reply to a given email.

Reply YES (needsReply: true) when:
- The sender asks a direct question
- The sender requests a decision, approval, or action from the recipient
- The sender is waiting on something the recipient owes them
- The email is from a real human and is part of an ongoing conversation

Reply NO (needsReply: false) when:
- It is a newsletter, marketing, receipt, notification, or automated alert
- The sender clearly does not expect a reply (e.g. "no need to reply")
- The recipient is on CC and is not the addressee of the question
- The email is purely informational / FYI

The "reason" field must be one short present-tense sentence (≤80 chars) that explains the decision in human terms a busy person can scan in 1 second.`

const SCHEMA = {
  type: 'object',
  properties: {
    needsReply: { type: 'boolean' },
    reason: { type: 'string', maxLength: 80 },
  },
  required: ['needsReply', 'reason'],
} as const

export async function classifyNeedsReply(
  provider: AiProvider,
  model: string,
  input: ClassifyInput,
): Promise<ClassifyOutput> {
  const userText = `From: ${input.fromAddress}\nSubject: ${input.subject}\n\n${input.body}`
  const result = await provider.generate({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ],
    jsonSchema: SCHEMA,
    temperature: 0,
    maxTokens: 120,
  })

  const json = result.json as Partial<ClassifyOutput> | undefined
  if (
    !json ||
    typeof json.needsReply !== 'boolean' ||
    typeof json.reason !== 'string'
  ) {
    throw new Error('classifyNeedsReply: invalid model output')
  }
  return {
    needsReply: json.needsReply,
    reason: json.reason.slice(0, 80),
  }
}
