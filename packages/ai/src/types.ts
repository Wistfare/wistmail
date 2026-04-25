/**
 * Multimodal-shaped message types. Today the worker only sends text, but
 * Gemma 4 supports image + audio input on E2B/E4B — keeping the content
 * shape as an array of typed parts means future jobs (voice-note replies,
 * receipt summarization) are a parameter change, not a refactor.
 */

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'audio'; url: string }

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface GenerateOptions {
  model: string
  messages: Message[]
  /// Output schema. When set, the provider must return a value that
  /// matches the schema (the Ollama path uses native structured output).
  jsonSchema?: Record<string, unknown>
  /// Tools the model may call. Used for the agentic plan-today digest.
  tools?: ToolDefinition[]
  /// Soft caps; providers can ignore.
  maxTokens?: number
  temperature?: number
  /// Gemma 4 has a built-in chain-of-thought that, when enabled, eats
  /// the entire output budget before emitting the answer. Default off
  /// for short structured jobs (classify/label/draft); the today digest
  /// turns it on because the planning step benefits from reasoning.
  think?: boolean
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface GenerateResult {
  /// Raw assistant text. Empty when the model only emitted tool calls.
  text: string
  /// Parsed JSON when `jsonSchema` was provided. Throws upstream if the
  /// model emitted invalid JSON — providers must not silently coerce.
  json?: unknown
  toolCalls?: Array<{
    name: string
    arguments: Record<string, unknown>
  }>
  /// Raw token counts when reported. Useful for queue throughput metrics.
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}
