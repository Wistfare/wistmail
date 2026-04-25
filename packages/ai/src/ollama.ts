import type { AiProvider } from './provider'
import type { ContentPart, GenerateOptions, GenerateResult, Message } from './types'

interface OllamaConfig {
  /// Defaults to `http://127.0.0.1:11434`. Override via OLLAMA_HOST env.
  host?: string
  /// Fetch impl override — useful for tests.
  fetchImpl?: typeof fetch
  /// Per-request timeout in ms. Generation jobs can run 30s+ on CPU,
  /// so we default high and let the queue's own timeout drive cancellation.
  timeoutMs?: number
}

/**
 * Ollama provider. Talks to a local `ollama serve` over its REST API.
 * No SDK — `fetch` keeps the worker container lean and avoids dragging
 * an extra dependency for two endpoints.
 *
 * Concurrency: a single Ollama process serializes generations on CPU
 * (one model, no parallelism in our config). Multiple BullMQ workers
 * pointing at the same Ollama will queue up against each other — the
 * worker's BullMQ concurrency cap is what actually controls parallelism.
 */
export class OllamaProvider implements AiProvider {
  readonly name = 'ollama'
  private readonly host: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(config: OllamaConfig = {}) {
    this.host = (config.host ?? process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(
      /\/+$/,
      '',
    )
    this.fetchImpl = config.fetchImpl ?? fetch
    this.timeoutMs = config.timeoutMs ?? 5 * 60 * 1000
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages.map((m) => this.toOllamaMessage(m)),
      stream: false,
      // Default off — the chain-of-thought consumes the output budget
      // and is unhelpful for structured short outputs.
      think: opts.think ?? false,
      options: {
        // Cap at 4 host CPU threads — the box has 8 vCPUs and we leave
        // 4 for Postgres / Redis / API / WS / mail-engine to stay
        // responsive during a generation burst.
        num_thread: 4,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { num_predict: opts.maxTokens } : {}),
      },
    }
    if (opts.jsonSchema) {
      body.format = opts.jsonSchema
    }
    if (opts.tools) {
      body.tools = opts.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
    }

    let res: Response
    try {
      res = await this.fetchImpl(`${this.host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = (await res.json()) as OllamaChatResponse

    const text = data.message?.content ?? ''
    const result: GenerateResult = { text }
    if (data.message?.tool_calls) {
      result.toolCalls = data.message.tool_calls.map((tc) => ({
        name: tc.function.name,
        arguments: tc.function.arguments,
      }))
    }
    if (opts.jsonSchema && text) {
      try {
        result.json = JSON.parse(text)
      } catch (err) {
        throw new Error(`Ollama returned non-JSON despite jsonSchema: ${(err as Error).message}`)
      }
    }
    if (data.prompt_eval_count !== undefined && data.eval_count !== undefined) {
      result.usage = {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
      }
    }
    return result
  }

  private toOllamaMessage(m: Message): OllamaMessage {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content }
    }
    const text = m.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
    const images = m.content
      .filter((p): p is { type: 'image'; url: string } => p.type === 'image')
      .map((p) => p.url)
    const out: OllamaMessage = { role: m.role, content: text }
    if (images.length > 0) {
      out.images = images
    }
    return out
  }
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]
}

interface OllamaChatResponse {
  message?: {
    role: string
    content: string
    tool_calls?: Array<{
      function: { name: string; arguments: Record<string, unknown> }
    }>
  }
  prompt_eval_count?: number
  eval_count?: number
}

// Suppress unused param warning when ContentPart isn't referenced
// directly elsewhere in this module.
void (null as unknown as ContentPart)
