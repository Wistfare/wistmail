import { describe, expect, it } from 'vitest'
import {
  createProvider,
  readProviderKindFromEnv,
} from './factory'
import { AnthropicProvider } from './anthropic'
import { OllamaProvider } from './ollama'
import { OpenAIProvider } from './openai'

describe('readProviderKindFromEnv', () => {
  it('returns the fallback when env is unset', () => {
    expect(readProviderKindFromEnv(undefined)).toBe('ollama')
    expect(readProviderKindFromEnv(undefined, 'openai')).toBe('openai')
  })

  it('parses ollama / openai / anthropic case-insensitively', () => {
    expect(readProviderKindFromEnv('OLLAMA')).toBe('ollama')
    expect(readProviderKindFromEnv('OpenAI')).toBe('openai')
    expect(readProviderKindFromEnv(' anthropic ')).toBe('anthropic')
  })

  it('throws on unknown values', () => {
    expect(() => readProviderKindFromEnv('llama-cpp')).toThrow(
      /one of ollama\|openai\|anthropic/,
    )
  })
})

describe('createProvider', () => {
  it('builds an OllamaProvider by default', () => {
    const p = createProvider()
    expect(p).toBeInstanceOf(OllamaProvider)
    expect(p.name).toBe('ollama')
  })

  it('builds an OpenAIProvider when kind=openai (apiKey supplied)', () => {
    const p = createProvider({ kind: 'openai', openaiApiKey: 'sk-x' })
    expect(p).toBeInstanceOf(OpenAIProvider)
    expect(p.name).toBe('openai')
  })

  it('builds an AnthropicProvider when kind=anthropic (apiKey supplied)', () => {
    const p = createProvider({ kind: 'anthropic', anthropicApiKey: 'sk-ant' })
    expect(p).toBeInstanceOf(AnthropicProvider)
    expect(p.name).toBe('anthropic')
  })
})
