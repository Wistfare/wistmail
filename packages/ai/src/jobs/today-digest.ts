import type { AiProvider } from '../provider'
import type { TodayDigestInput, TodayDigestOutput } from './types'

const SYSTEM_PROMPT = `You are the user's morning briefing. Given today's pending emails, calendar, and open tasks, produce:

1. A 1-2 sentence "briefing" — friendly, second person, mentions the most concrete thing on the user's plate today.
2. A "priorities" list of up to 5 items the user should tackle first. Each cites a specific email/task/event by id and gives a one-line reason.
3. "focusBlocks" — 1 or 2 suggested deep-work windows that fit between meetings. Pick existing gaps; don't invent times outside the user's calendar window.

Keep the tone calm and concrete. No emojis. No motivational fluff. The user reads this on their phone in 5 seconds.`

const SCHEMA = {
  type: 'object',
  properties: {
    briefing: { type: 'string', maxLength: 240 },
    priorities: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['email', 'task', 'event'] },
          id: { type: 'string' },
          reason: { type: 'string', maxLength: 100 },
        },
        required: ['kind', 'id', 'reason'],
      },
    },
    focusBlocks: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        properties: {
          startAt: { type: 'string' },
          endAt: { type: 'string' },
          label: { type: 'string', maxLength: 40 },
        },
        required: ['startAt', 'endAt', 'label'],
      },
    },
  },
  required: ['briefing', 'priorities', 'focusBlocks'],
} as const

export async function todayDigest(
  provider: AiProvider,
  model: string,
  input: TodayDigestInput,
): Promise<TodayDigestOutput> {
  // Compose a compact context string. The 128K context means we could
  // dump much more, but we want the model to stay focused on the items
  // we've already pre-filtered as relevant.
  const sections = [
    `User: ${input.userDisplayName}`,
    '',
    `Today's events:`,
    ...input.todayEvents.map(
      (e) => `- [${e.id}] ${e.startAt}–${e.endAt} ${e.title}`,
    ),
    '',
    `Pending emails (latest first):`,
    ...input.pendingEmails.map(
      (e) =>
        `- [${e.id}] ${e.needsReply ? '(needs reply) ' : ''}${e.fromAddress} — ${e.subject} — ${e.snippet}`,
    ),
    '',
    `Open tasks:`,
    ...input.openTasks.map(
      (t) => `- [${t.id}] ${t.projectName} / ${t.title} (${t.status})`,
    ),
  ]

  const result = await provider.generate({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: sections.join('\n') },
    ],
    jsonSchema: SCHEMA,
    temperature: 0.4,
    maxTokens: 1200,
    // The digest is the one job where chain-of-thought reasoning
    // visibly improves prioritization quality — turn it on.
    think: true,
  })

  const json = result.json as Partial<TodayDigestOutput> | undefined
  if (
    !json ||
    typeof json.briefing !== 'string' ||
    !Array.isArray(json.priorities) ||
    !Array.isArray(json.focusBlocks)
  ) {
    throw new Error('todayDigest: invalid model output')
  }
  return {
    briefing: json.briefing.slice(0, 240),
    priorities: json.priorities.slice(0, 5),
    focusBlocks: json.focusBlocks.slice(0, 2),
  }
}
