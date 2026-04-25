import type { GenerateOptions, GenerateResult } from './types'

/**
 * Backend-agnostic interface. Today the only impl is Ollama (local Gemma 4
 * E4B); the same surface plugs OpenAI / Claude later for users who'd
 * rather pay per-token than self-host.
 *
 * Providers MUST be safe to call concurrently — the worker fans out
 * classify + label + summarize + draft jobs in parallel and any
 * serialization (e.g. one-at-a-time CPU) belongs inside the impl.
 */
export interface AiProvider {
  readonly name: string
  generate(opts: GenerateOptions): Promise<GenerateResult>
}
