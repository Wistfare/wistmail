import type { AiProvider } from './provider'
import type { GenerateOptions, GenerateResult, Message } from './types'

interface AnthropicConfig {
  /// API base URL. Defaults to Anthropic's public endpoint.
  baseUrl?: string
  /// API key. Required.
  apiKey?: string
  /// Anthropic API version header. Pinned to the stable date that
  /// supports tool use + structured-style output via tools.
  apiVersion?: string
  /// Per-request timeout in ms.
  timeoutMs?: number
  /// Fetch impl override — useful for tests.
  fetchImpl?: typeof fetch
}

/**
 * Anthropic Messages API provider. The Anthropic API doesn't have a
 * direct equivalent of OpenAI's `response_format: json_schema`, so we
 * synthesize structured output by exposing a single tool whose
 * parameter schema IS the requested jsonSchema, then forcing
 * `tool_choice` to that tool. The model returns the result as a tool
 * call, which we unwrap into `result.json` so callers see the same
 * shape they'd get from Ollama / OpenAI.
 *
 * Reference: https://docs.anthropic.com/en/api/messages
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic'
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly apiVersion: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(config: AnthropicConfig = {}) {
    this.baseUrl = (
      config.baseUrl ??
      process.env.ANTHROPIC_BASE_URL ??
      'https://api.anthropic.com/v1'
    ).replace(/\/+$/, '')
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? ''
    this.apiVersion = config.apiVersion ?? '2023-06-01'
    this.timeoutMs = config.timeoutMs ?? 60_000
    this.fetchImpl = config.fetchImpl ?? fetch
    if (!this.apiKey) {
      throw new Error(
        'AnthropicProvider: ANTHROPIC_API_KEY (or apiKey config) is required',
      )
    }
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    // Anthropic's API takes `system` as a top-level field, NOT a
    // message. Strip system messages out and concatenate them.
    const systemParts = opts.messages
      .filter((m) => m.role === 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n\n')
      .trim()
    const conversation = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => this.toAnthropicMessage(m))

    const body: Record<string, unknown> = {
      model: opts.model,
      // Anthropic requires `max_tokens` — default to a generous cap
      // when callers leave it unset.
      max_tokens: opts.maxTokens ?? 1024,
      messages: conversation,
      ...(systemParts ? { system: systemParts } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    }

    // Synthesize structured output via a forced tool call. Naming the
    // tool `result` matches the convention we use in the OpenAI
    // provider so reading worker logs gives a consistent shape across
    // providers.
    const tools: Array<{
      name: string
      description: string
      input_schema: Record<string, unknown>
    }> = []
    let forcedToolName: string | null = null
    if (opts.jsonSchema) {
      tools.push({
        name: 'result',
        description: 'Return the structured answer.',
        input_schema: opts.jsonSchema,
      })
      forcedToolName = 'result'
    }
    if (opts.tools && opts.tools.length > 0) {
      for (const t of opts.tools) {
        tools.push({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })
      }
    }
    if (tools.length > 0) {
      body.tools = tools
      if (forcedToolName) {
        body.tool_choice = { type: 'tool', name: forcedToolName }
      }
    }

    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as AnthropicMessageResponse

    const blocks = data.content ?? []
    const textBlocks = blocks
      .filter((b): b is AnthropicTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const toolBlocks = blocks.filter(
      (b): b is AnthropicToolBlock => b.type === 'tool_use',
    )

    const result: GenerateResult = { text: textBlocks }

    if (opts.jsonSchema) {
      // Find the forced `result` tool call and unwrap its input —
      // that's our JSON output. If the model emitted text instead
      // (rare; happens when the schema is impossible) we surface
      // a clear error rather than silently returning null.
      const block = toolBlocks.find((b) => b.name === 'result')
      if (!block) {
        throw new Error(
          'Anthropic returned no `result` tool call despite jsonSchema',
        )
      }
      result.json = block.input
    } else if (toolBlocks.length > 0) {
      // Caller-supplied tools surface as toolCalls.
      result.toolCalls = toolBlocks.map((b) => ({
        name: b.name,
        arguments: b.input,
      }))
    }

    if (data.usage) {
      result.usage = {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      }
    }
    return result
  }

  private toAnthropicMessage(m: Message): AnthropicMessage {
    if (typeof m.content === 'string') {
      return { role: m.role as 'user' | 'assistant', content: m.content }
    }
    const blocks = m.content.map((p) => {
      if (p.type === 'text') return { type: 'text' as const, text: p.text }
      if (p.type === 'image') {
        // Anthropic accepts a `source` of either url or base64. We
        // always pass URLs through unchanged; data: URLs are split
        // into media-type + base64 by the API server already.
        return {
          type: 'image' as const,
          source: { type: 'url' as const, url: p.url },
        }
      }
      return { type: 'text' as const, text: '[audio omitted]' }
    })
    return {
      role: m.role as 'user' | 'assistant',
      content: blocks,
    }
  }
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'url'; url: string } }

interface AnthropicTextBlock {
  type: 'text'
  text: string
}

interface AnthropicToolBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface AnthropicMessageResponse {
  content?: Array<AnthropicTextBlock | AnthropicToolBlock | { type: string }>
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}
