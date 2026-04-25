import { describe, expect, it, vi } from 'vitest'
import { OllamaProvider } from './ollama'

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'content-type': 'application/json' },
  })
}

describe('OllamaProvider', () => {
  it('serializes messages and parses JSON output', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        message: { role: 'assistant', content: '{"needsReply":true,"reason":"asks for sign-off"}' },
        prompt_eval_count: 12,
        eval_count: 18,
      }),
    )
    const p = new OllamaProvider({ host: 'http://test', fetchImpl: fetchImpl as unknown as typeof fetch })
    const r = await p.generate({
      model: 'gemma4:e4b',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      jsonSchema: { type: 'object' },
    })
    expect(r.json).toEqual({ needsReply: true, reason: 'asks for sign-off' })
    expect(r.usage).toEqual({ promptTokens: 12, completionTokens: 18 })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.model).toBe('gemma4:e4b')
    expect(body.options.num_thread).toBe(4)
    expect(body.format).toEqual({ type: 'object' })
    expect(body.think).toBe(false)
  })

  it('flattens multimodal content into text + images', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: { role: 'assistant', content: 'ok' } }),
    )
    const p = new OllamaProvider({ host: 'http://test', fetchImpl: fetchImpl as unknown as typeof fetch })
    await p.generate({
      model: 'gemma4:e4b',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'describe' },
            { type: 'image', url: 'data:image/png;base64,AAA' },
          ],
        },
      ],
    })
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string)
    expect(body.messages[0].content).toBe('describe')
    expect(body.messages[0].images).toEqual(['data:image/png;base64,AAA'])
  })

  it('throws when Ollama returns non-JSON despite jsonSchema', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ message: { role: 'assistant', content: 'not json' } }),
    )
    const p = new OllamaProvider({ host: 'http://test', fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(
      p.generate({
        model: 'gemma4:e4b',
        messages: [{ role: 'user', content: 'hi' }],
        jsonSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/non-JSON/)
  })

  it('surfaces HTTP errors with status + truncated body', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('boom', { status: 503 }),
    )
    const p = new OllamaProvider({ host: 'http://test', fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(
      p.generate({ model: 'x', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/Ollama 503/)
  })
})
