import type { AiProvider } from '../provider'
import type { AutoLabelInput, AutoLabelOutput } from './types'

const SYSTEM_PROMPT = `You apply zero or more labels from a closed list to an email. Pick only labels that clearly match the email's content or sender. Do not invent new labels. If nothing fits, return an empty array.

Return labels with confidence 0..1 — confidence under 0.6 will be discarded by the caller, so don't bother including weak matches.`

export async function autoLabel(
  provider: AiProvider,
  model: string,
  input: AutoLabelInput,
): Promise<AutoLabelOutput> {
  if (input.availableLabels.length === 0) {
    return { labels: [] }
  }

  // Embed the label catalog into the prompt so the model can reference
  // it by id without hallucinating one. We instruct the model to echo
  // back ids verbatim.
  const labelList = input.availableLabels.map((l) => `- ${l.id}: ${l.name}`).join('\n')
  const userText =
    `Available labels (id: name):\n${labelList}\n\n` +
    `Email:\nFrom: ${input.fromAddress}\nSubject: ${input.subject}\n\n${input.body}`

  const schema = {
    type: 'object',
    properties: {
      labels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: input.availableLabels.map((l) => l.id) },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['id', 'confidence'],
        },
        maxItems: 5,
      },
    },
    required: ['labels'],
  }

  const result = await provider.generate({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ],
    jsonSchema: schema,
    temperature: 0,
    maxTokens: 200,
  })

  const json = result.json as { labels?: Array<{ id: unknown; confidence: unknown }> } | undefined
  const validIds = new Set(input.availableLabels.map((l) => l.id))
  const labels: AutoLabelOutput['labels'] = []
  for (const row of json?.labels ?? []) {
    if (typeof row.id === 'string' && typeof row.confidence === 'number' && validIds.has(row.id)) {
      labels.push({ id: row.id, confidence: Math.max(0, Math.min(1, row.confidence)) })
    }
  }
  return { labels }
}
