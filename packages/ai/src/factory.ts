import { AnthropicProvider } from './anthropic'
import { OllamaProvider } from './ollama'
import { OpenAIProvider } from './openai'
import type { AiProvider } from './provider'

export type AiProviderKind = 'ollama' | 'openai' | 'anthropic'

export interface CreateProviderOptions {
  /// Selects the implementation. Defaults to `ollama` so existing
  /// self-hosted setups need zero config changes.
  kind?: AiProviderKind
  /// Ollama: defaults to `http://127.0.0.1:11434`.
  ollamaHost?: string
  /// OpenAI: API key (otherwise read from OPENAI_API_KEY env).
  openaiApiKey?: string
  openaiBaseUrl?: string
  /// Anthropic: API key (otherwise read from ANTHROPIC_API_KEY env).
  anthropicApiKey?: string
  anthropicBaseUrl?: string
}

/**
 * Build the concrete `AiProvider` implementation matching `kind`. The
 * worker boot path uses this so swapping providers is a one-line env
 * change (`AI_PROVIDER=openai`) instead of a code edit. Each branch
 * picks up its own env vars (OPENAI_API_KEY, ANTHROPIC_API_KEY,
 * OLLAMA_HOST) so we don't multiplex secrets through a single name.
 */
export function createProvider(opts: CreateProviderOptions = {}): AiProvider {
  const kind = opts.kind ?? 'ollama'
  switch (kind) {
    case 'ollama':
      return new OllamaProvider({ host: opts.ollamaHost })
    case 'openai':
      return new OpenAIProvider({
        apiKey: opts.openaiApiKey,
        baseUrl: opts.openaiBaseUrl,
      })
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: opts.anthropicApiKey,
        baseUrl: opts.anthropicBaseUrl,
      })
    default: {
      // Compile-time exhaustiveness — flag a missing case if the union grows.
      const exhaustive: never = kind
      throw new Error(`Unknown AI provider: ${exhaustive as string}`)
    }
  }
}

/// Read the `AI_PROVIDER` env var and validate it's one of the
/// supported kinds. Used by `loadConfig()` in the ai-worker.
export function readProviderKindFromEnv(
  raw: string | undefined,
  fallback: AiProviderKind = 'ollama',
): AiProviderKind {
  if (!raw) return fallback
  const lower = raw.trim().toLowerCase()
  if (lower === 'ollama' || lower === 'openai' || lower === 'anthropic') {
    return lower
  }
  throw new Error(
    `AI_PROVIDER must be one of ollama|openai|anthropic, got: ${raw}`,
  )
}
