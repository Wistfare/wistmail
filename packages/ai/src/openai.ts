import type { AiProvider } from './provider'
import type { GenerateOptions, GenerateResult, Message } from './types'

interface OpenAIConfig {
  /// API base URL. Defaults to OpenAI's public endpoint; override for
  /// Azure OpenAI or any OpenAI-compatible gateway (LiteLLM, vLLM, etc).
  baseUrl?: string
  /// Bearer token. Required.
  apiKey?: string
  /// Per-request timeout in ms. OpenAI is fast on the wire but the
  /// queue's own per-job timeout is the real cancellation driver.
  timeoutMs?: number
  /// Fetch impl override — useful for tests.
  fetchImpl?: typeof fetch
}

/**
 * OpenAI Chat Completions provider. Uses the public REST API directly
 * (no SDK) to keep the worker container slim — same approach as
 * `OllamaProvider`. Compatible with any OpenAI-style endpoint that
 * follows the v1 chat completions schema (Azure OpenAI with the right
 * deployment URL, LiteLLM gateways, etc).
 *
 * Structured output uses `response_format: { type: 'json_schema', ... }`
 * so the model is forced to emit valid JSON matching the supplied
 * schema. Older models that don't support `json_schema` should fall
 * back to a plain `json_object` mode — not implemented here yet
 * because every current GPT-4-class model supports schema mode.
 */
export class OpenAIProvider implements AiProvider {
  readonly name = 'openai'
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(config: OpenAIConfig = {}) {
    this.baseUrl = (
      config.baseUrl ??
      process.env.OPENAI_BASE_URL ??
      'https://api.openai.com/v1'
    ).replace(/\/+$/, '')
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? ''
    this.timeoutMs = config.timeoutMs ?? 60_000
    this.fetchImpl = config.fetchImpl ?? fetch
    if (!this.apiKey) {
      throw new Error('OpenAIProvider: OPENAI_API_KEY (or apiKey config) is required')
    }
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages.map((m) => this.toOpenAIMessage(m)),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    }
    if (opts.jsonSchema) {
      // Force structured output. The schema name is required by the
      // API and is opaque to us — use a generic "result" so logs are
      // readable. `strict: true` makes the model emit a value that
      // strictly conforms to the schema.
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'result',
          strict: true,
          schema: opts.jsonSchema,
        },
      }
    }
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
    }

    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as OpenAIChatResponse

    const choice = data.choices?.[0]
    const text = choice?.message?.content ?? ''
    const result: GenerateResult = { text }

    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      result.toolCalls = choice.message.tool_calls.map((tc) => ({
        name: tc.function.name,
        // The API ships JSON-encoded arguments; parse them so callers
        // see a typed object identical to the Ollama branch.
        arguments: safeJsonObject(tc.function.arguments),
      }))
    }

    if (opts.jsonSchema && text) {
      try {
        result.json = JSON.parse(text)
      } catch (err) {
        throw new Error(
          `OpenAI returned non-JSON despite jsonSchema: ${(err as Error).message}`,
        )
      }
    }
    if (data.usage) {
      result.usage = {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
      }
    }
    return result
  }

  private toOpenAIMessage(m: Message): OpenAIMessage {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content }
    }
    // Map our typed parts to OpenAI's `content: array` form. OpenAI
    // calls them `image_url` (a wrapped object) — translate.
    const parts = m.content.map((p) => {
      if (p.type === 'text') return { type: 'text' as const, text: p.text }
      if (p.type === 'image') {
        return {
          type: 'image_url' as const,
          image_url: { url: p.url },
        }
      }
      // Audio not yet supported by GPT-4o on the chat-completions
      // endpoint — drop with a marker so the request doesn't blow up.
      return { type: 'text' as const, text: '[audio omitted]' }
    })
    return { role: m.role, content: parts }
  }
}

function safeJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | OpenAIContentPart[]
}

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        function: { name: string; arguments: string }
      }>
    }
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
  }
}
