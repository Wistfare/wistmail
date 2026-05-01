/**
 * Single-call agentic email ingest.
 *
 * Replaces the previous per-job fan-out (5–6 separate model calls
 * per inbound: classify, summarize, label, draft, extract-meeting,
 * derive-name) with one tool-calling pass:
 *
 *   - The model reads the email once.
 *   - It chooses which tools to invoke based on what's actually
 *     relevant (newsletter → just `apply_labels`, real ask → also
 *     `flag_needs_reply` + `draft_replies`, meeting confirmation →
 *     also `create_meeting`).
 *   - The worker dispatches each call to a DB write.
 *
 * Cost: ~5x fewer model calls per email. Quality: the model has
 * cross-task context (its summarize tool can reflect the same
 * urgency it just decided on). Failure mode: a single bad output
 * means no work for the email — the worker keeps the per-job
 * processors as fallback for callers that want strict guarantees
 * (backfills, manual re-runs).
 */

import type { AiProvider } from '../provider'
import type { ToolDefinition } from '../types'

/// What the model produces and the worker consumes. We DON'T strongly
/// type each call's `arguments` here — the worker validates per
/// tool name when dispatching, so a malformed call gets dropped
/// rather than crashing the job.
export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface AgenticIngestInput {
  fromName: string | null
  fromAddress: string
  subject: string
  /// Plain-text body, upstream-trimmed to ~4000 chars.
  body: string
  /// ISO 8601 of the email's send time. Anchors relative phrases
  /// the model might process via create_meeting ("tomorrow at 11").
  sentAtIso: string
  /// User's IANA timezone — fallback for ambiguous wall-clock times
  /// in extracted meetings. Always passed even when irrelevant.
  recipientTimezone: string
  /// User's display name + email — context for draft replies so the
  /// model signs off correctly.
  userDisplayName: string
  /// Catalog of the user's existing labels. The model picks zero or
  /// more by id; it never invents new ids.
  availableLabels: Array<{ id: string; name: string }>
}

export interface AgenticIngestOutput {
  /// Every tool call the model emitted, in the order produced.
  /// Worker dispatches each. Empty when the model decided nothing
  /// is actionable on this email.
  toolCalls: ToolCall[]
  /// The model's free-text response, if any. Usually empty when
  /// tool calls are produced — kept for diagnostics.
  text: string
  usage?: { promptTokens: number; completionTokens: number }
}

const SYSTEM_PROMPT = `You are an email triage assistant. Read the email and CALL multiple tools — not just one — to capture everything actionable.

Required calls:
1. ALWAYS call \`summarize\` exactly once. Every email gets a 1–2 sentence summary.

Conditional calls — evaluate each independently:
2. Call \`flag_needs_reply\` if the recipient genuinely owes a reply (direct question, decision needed, person waiting). Skip for newsletters, receipts, automated alerts, FYI. Confidence-bearing: pick urgency in 0..1 (NOT 0..10).
3. Call \`apply_labels\` if one or more of the user's existing labels clearly fit. Pick by id from the catalog. Never invent ids. Skip if none fit.
4. Call \`draft_replies\` whenever you also called \`flag_needs_reply\`. Drafts are tap-to-fill — sign with the user's first name only.
5. Call \`create_meeting\` whenever the email mentions a specific scheduled time, even in passing. Examples that REQUIRE this call:
   - "tomorrow at 11 AM" / "this Friday 3pm" / "Monday 10:00 EST"  → call it
   - "let's sync at 2 today" / "meeting at 11 Kigali time"          → call it
   - confirmation/reminder of a previously-agreed time              → call it
   Skip ONLY when the email mentions no concrete time at all (vague "let's meet sometime").
   Resolve relative phrases ("tomorrow at 11") into absolute ISO 8601 with timezone offset using the email's "Sent" timestamp + the "Recipient timezone" field. confidence ≥ 0.85 means "I am sure of the time"; the worker only auto-creates above that floor.

Calls compose: a meeting-confirmation email needing the v2 deck → \`summarize\` + \`flag_needs_reply\` + \`draft_replies\` + \`create_meeting\` (4 calls). A newsletter → just \`summarize\` (1 call).

Hard rules:
- DO NOT invent facts that aren't in the email.
- DO NOT pull dates or content from quoted history (lines starting with \`>\` or "On … wrote:").
- All numeric arguments are 0..1 unless a tool says otherwise.
- The set of tool calls you emit IS the entire result — the caller does NOT make a second pass.`

/// Tool definitions in Ollama's expected shape. The provider passes
/// these through to llama.cpp's chat template, which Gemma 4 was
/// trained to consume.
function buildTools(input: AgenticIngestInput): ToolDefinition[] {
  return [
    {
      name: 'summarize',
      description:
        'Store a 1–2 sentence summary of the email for the unified inbox preview. Capture the ask or key fact, not pleasantries. Call this on EVERY email.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', maxLength: 280 },
        },
        required: ['summary'],
      },
    },
    {
      name: 'flag_needs_reply',
      description:
        'Mark the email as needing a reply. Only call when the sender is genuinely waiting on the recipient — direct questions, decisions needed, or open asks. Do NOT call for newsletters, receipts, automated alerts.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            maxLength: 80,
            description:
              'One short present-tense sentence the recipient can scan in 1 second.',
          },
          urgency: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description:
              '0.0–0.2: not urgent. 0.3–0.5: standard reply within a day. 0.6–0.8: time-bound (deadline today). 0.9–1.0: drop-everything.',
          },
        },
        required: ['reason', 'urgency'],
      },
    },
    {
      name: 'apply_labels',
      description: `Assign zero or more labels from the user's catalog. Only pick labels that clearly fit. Skip the call if nothing fits.\n\nAvailable label ids:\n${input.availableLabels.map((l) => `- ${l.id}: ${l.name}`).join('\n') || '(none)'}`,
      parameters: {
        type: 'object',
        properties: {
          labels: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  enum: input.availableLabels.map((l) => l.id),
                },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
              required: ['id', 'confidence'],
            },
          },
        },
        required: ['labels'],
      },
    },
    {
      name: 'draft_replies',
      description:
        'Generate up to 3 reply drafts (concise, warm, decline). Only call when flag_needs_reply was also called. Each draft is a tap-to-fill starting point — the user always edits before sending. Sign with the user’s first name only; no signature block.',
      parameters: {
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
      },
    },
    {
      name: 'create_meeting',
      description:
        'Auto-create a calendar event when the email confidently proposes or confirms a specific time. Resolve relative phrases ("tomorrow at 11") into absolute ISO 8601 with offset using the email\'s sent time and the recipient timezone. DO NOT invent times. confidence < 0.85 means do not call.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 200 },
          startAt: {
            type: 'string',
            description: 'ISO 8601 with timezone offset.',
          },
          endAt: { type: 'string', description: 'ISO 8601. Default startAt + 1h if not stated.' },
          location: { type: ['string', 'null'], maxLength: 500 },
          attendees: {
            type: 'array',
            items: { type: 'string', maxLength: 200 },
            maxItems: 20,
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['title', 'startAt', 'endAt', 'confidence'],
      },
    },
  ]
}

export async function agenticIngest(
  provider: AiProvider,
  model: string,
  input: AgenticIngestInput,
): Promise<AgenticIngestOutput> {
  const userText =
    `From: ${input.fromName ? `${input.fromName} <${input.fromAddress}>` : input.fromAddress}\n` +
    `Sent: ${input.sentAtIso}\n` +
    `Recipient: ${input.userDisplayName}\n` +
    `Recipient timezone: ${input.recipientTimezone}\n` +
    `Subject: ${input.subject}\n\n` +
    input.body

  const result = await provider.generate({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText },
    ],
    tools: buildTools(input),
    temperature: 0.2,
    maxTokens: 1500,
  })

  const calls: ToolCall[] = (result.toolCalls ?? []).map((tc) => ({
    name: tc.name,
    arguments: tc.arguments ?? {},
  }))

  return {
    toolCalls: calls,
    text: result.text,
    usage: result.usage,
  }
}
