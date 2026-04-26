import type { AiProvider } from '../provider'

export interface DeriveInput {
  /// Local-part of the address (no `@domain`).
  localPart: string
  /// Domain — sometimes useful context (e.g. "gmail.com" implies a
  /// human; "github.com" implies a service).
  domain: string
}

export interface DeriveOutput {
  /// Empty string when the model decides this is a role/service
  /// address rather than a person. Caller stores '' with source
  /// 'unknown' to skip future AI calls.
  name: string
  confidence: number
}

const SYSTEM_PROMPT = `Convert an email's local-part into the human display name it likely represents.

Examples:
- "john.doe" + "gmail.com" → {"name": "John Doe", "confidence": 0.95}
- "nsengimanavedadom" + "gmail.com" → {"name": "Nsengimana Veda Dom", "confidence": 0.6}
- "vedadom" + "gmail.com" → {"name": "Veda Dom", "confidence": 0.4}
- "support" + "company.com" → {"name": "", "confidence": 0.95}  (role, not a person)
- "noreply" + "github.com" → {"name": "", "confidence": 0.99}    (automated)
- "u8217492" + "service.io" → {"name": "", "confidence": 0.9}    (opaque id)

Rules:
- For fused names with no separators (like "nsengimanavedadom"), do your best to split at likely word boundaries based on common given names + surnames.
- For role addresses (support, hello, info, marketing, sales, billing, abuse, etc.), return name="" and high confidence — they are NOT people.
- For automated/system addresses (noreply, mailer-daemon, postmaster, notifications), return name="" and high confidence.
- For opaque ids (random letters/numbers, hash-like), return name="" and high confidence.
- Confidence is your belief that the resulting name is what a human would actually write on a business card. Be honest — 0.4 for fused-but-plausible, 0.6+ for split-with-known-name-shape, 0.9+ for clear separator-delimited names.`

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 255 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['name', 'confidence'],
} as const

export async function deriveDisplayName(
  provider: AiProvider,
  model: string,
  input: DeriveInput,
): Promise<DeriveOutput> {
  const userText = `Local-part: ${input.localPart}\nDomain: ${input.domain}`
  const result = await provider.generate({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ],
    jsonSchema: SCHEMA,
    temperature: 0.1,
    maxTokens: 100,
  })
  const json = result.json as Partial<DeriveOutput> | undefined
  if (!json || typeof json.name !== 'string' || typeof json.confidence !== 'number') {
    throw new Error('deriveDisplayName: invalid model output')
  }
  return {
    name: json.name.slice(0, 255),
    confidence: Math.max(0, Math.min(1, json.confidence)),
  }
}
