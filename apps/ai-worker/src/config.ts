/**
 * Runtime config from env. The worker fails fast if anything required
 * is missing — better to crash on boot than silently swallow jobs.
 */

import {
  readProviderKindFromEnv,
  type AiProviderKind,
} from '@wistmail/ai'

export interface WorkerConfig {
  databaseUrl: string
  redisUrl: string
  /// Selected backend. Driven by `AI_PROVIDER` env (ollama|openai|
  /// anthropic). Each branch picks up its own credentials below; only
  /// the matching subset is required.
  provider: AiProviderKind
  ollamaHost: string
  openaiApiKey?: string
  openaiBaseUrl?: string
  anthropicApiKey?: string
  anthropicBaseUrl?: string
  model: string
  /// Max BullMQ jobs running concurrently in this process. Ollama on
  /// CPU serializes on the model so > 1 just adds queue contention,
  /// but OpenAI/Anthropic are I/O-bound and benefit from parallelism
  /// — bump AI_WORKER_CONCURRENCY when running against an API provider.
  concurrency: number
}

const DEFAULT_MODEL_BY_PROVIDER: Record<AiProviderKind, string> = {
  ollama: 'gemma4:e4b',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
}

export function loadConfig(): WorkerConfig {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) throw new Error('REDIS_URL is required')

  const provider = readProviderKindFromEnv(process.env.AI_PROVIDER, 'ollama')

  // Validate the matching credential is present. Better to crash on
  // boot than to wait for the first job to fail with a 401.
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('AI_PROVIDER=openai requires OPENAI_API_KEY')
  }
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY')
  }

  return {
    databaseUrl,
    redisUrl,
    provider,
    ollamaHost: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
    model: process.env.AI_MODEL ?? DEFAULT_MODEL_BY_PROVIDER[provider],
    concurrency: Number(process.env.AI_WORKER_CONCURRENCY ?? '1'),
  }
}
