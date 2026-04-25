/**
 * Runtime config from env. The worker fails fast if anything required
 * is missing — better to crash on boot than silently swallow jobs.
 */

export interface WorkerConfig {
  databaseUrl: string
  redisUrl: string
  ollamaHost: string
  model: string
  /// Max BullMQ jobs running concurrently in this process. With one
  /// Ollama serializing on CPU, > 1 just adds queue contention — leave at 1.
  concurrency: number
}

export function loadConfig(): WorkerConfig {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) throw new Error('REDIS_URL is required')

  return {
    databaseUrl,
    redisUrl,
    ollamaHost: process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434',
    model: process.env.AI_MODEL ?? 'gemma4:e4b',
    concurrency: Number(process.env.AI_WORKER_CONCURRENCY ?? '1'),
  }
}
