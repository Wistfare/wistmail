import type { AiProvider } from '../provider'
import type { ClassifyInput, ClassifyOutput } from './types'

const SYSTEM_PROMPT = `You are an email triage assistant. Decide whether the recipient needs to reply, and how time-sensitive it is.

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

The "reason" field must be one short present-tense sentence (≤80 chars) that explains the decision in human terms a busy person can scan in 1 second.

The "urgency" field is a number 0..1 that controls whether this email floats to the top of the user's daily priorities list:
- 0.0–0.2: not urgent (newsletter, FYI, automated alert, no reply expected)
- 0.3–0.5: standard reply expected within a day
- 0.6–0.8: time-bound (decision needed today, deadline mentioned, blocking another person)
- 0.9–1.0: drop-everything (incident, blocker, explicit "ASAP" or "URGENT")
When needsReply is false, urgency must be ≤ 0.2.`

const SCHEMA = {
  type: 'object',
  properties: {
    needsReply: { type: 'boolean' },
    reason: { type: 'string', maxLength: 80 },
    urgency: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['needsReply', 'reason', 'urgency'],
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
    maxTokens: 160,
  })

  const json = result.json as Partial<ClassifyOutput> | undefined
  if (
    !json ||
    typeof json.needsReply !== 'boolean' ||
    typeof json.reason !== 'string' ||
    typeof json.urgency !== 'number'
  ) {
    throw new Error('classifyNeedsReply: invalid model output')
  }
  // Enforce the model's own contract: a non-reply email never beats
  // 0.2 urgency. Belt-and-suspenders against a chatty model output.
  let urgency = Math.max(0, Math.min(1, json.urgency))
  if (!json.needsReply && urgency > 0.2) urgency = 0.2
  return {
    needsReply: json.needsReply,
    reason: json.reason.slice(0, 80),
    urgency,
  }
}
