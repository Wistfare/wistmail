import type { AiProvider } from '../provider'
import type { DraftReplyInput, DraftReplyOutput } from './types'

const SYSTEM_PROMPT = `Draft three reply options to the email below. Each draft is meant to be a tap-to-fill starting point — the user will edit before sending.

Tones to produce, exactly in this order:
1. concise — 1–2 sentences, gets straight to the point.
2. warm — 2–4 sentences, friendly opener, acknowledges the sender.
3. decline — polite no/decline/postpone if the sender is asking for something the recipient may want to push back on. If a decline doesn't make sense for this email, skip it (return only the first two).

Rules:
- Sign with the user's first name only — no signature block, no "Best,".
- Don't repeat the recipient's questions back at them.
- No emojis unless the original email had them.
- Plain text only.
- Do not invent facts. If you don't know a date or number, leave the placeholder phrase the user can fill in.

For each draft, give a self-rated quality score 0..1. Drafts that quote the email back, hedge excessively, or feel generic should score low — the caller drops anything under 0.4.`

const SCHEMA = {
  type: 'object',
  properties: {
    drafts: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          tone: { type: 'string', enum: ['concise', 'warm', 'decline'] },
          body: { type: 'string', maxLength: 1200 },
          score: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['tone', 'body', 'score'],
      },
    },
  },
  required: ['drafts'],
} as const

export async function draftReply(
  provider: AiProvider,
  model: string,
  input: DraftReplyInput,
): Promise<DraftReplyOutput> {
  const senderLabel = input.fromName ? `${input.fromName} <${input.fromAddress}>` : input.fromAddress
  const userText =
    `User's name: ${input.userDisplayName}\n` +
    `Sender: ${senderLabel}\n` +
    `Subject: ${input.subject}\n\n` +
    input.body

  const result = await provider.generate({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ],
    jsonSchema: SCHEMA,
    temperature: 0.6,
    maxTokens: 700,
  })

  const json = result.json as { drafts?: unknown } | undefined
  if (!json || !Array.isArray(json.drafts)) {
    throw new Error('draftReply: invalid model output')
  }
  const drafts: DraftReplyOutput['drafts'] = []
  for (const row of json.drafts) {
    if (
      row &&
      typeof row === 'object' &&
      typeof (row as { tone?: unknown }).tone === 'string' &&
      typeof (row as { body?: unknown }).body === 'string' &&
      typeof (row as { score?: unknown }).score === 'number'
    ) {
      const tone = (row as { tone: string }).tone as DraftReplyOutput['drafts'][number]['tone']
      if (tone === 'concise' || tone === 'warm' || tone === 'decline') {
        drafts.push({
          tone,
          body: (row as { body: string }).body.slice(0, 1200),
          score: Math.max(0, Math.min(1, (row as { score: number }).score)),
        })
      }
    }
  }
  return { drafts }
}
