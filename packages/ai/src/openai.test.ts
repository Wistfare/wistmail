import { describe, expect, it, vi } from 'vitest'
import { OpenAIProvider } from './openai'

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'content-type': 'application/json' },
  })
}

describe('OpenAIProvider', () => {
  it('throws on construct without apiKey or env', () => {
    const old = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      expect(() => new OpenAIProvider({})).toThrow(/OPENAI_API_KEY/)
    } finally {
      if (old !== undefined) process.env.OPENAI_API_KEY = old
    }
  })

  it('serializes messages, sets bearer auth, attaches json_schema', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '{"needsReply":true,"reason":"asks for sign-off","urgency":0.7}',
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 18 },
      }),
    )
    const p = new OpenAIProvider({
      apiKey: 'sk-test',
      baseUrl: 'http://test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const r = await p.generate({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      jsonSchema: { type: 'object' },
      temperature: 0,
      maxTokens: 100,
    })

    expect(r.json).toEqual({
      needsReply: true,
      reason: 'asks for sign-off',
      urgency: 0.7,
    })
    expect(r.usage).toEqual({ promptTokens: 12, completionTokens: 18 })

    const call = fetchImpl.mock.calls[0]!
    expect(call[0]).toBe('http://test/chat/completions')
    const init = call[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer sk-test')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.temperature).toBe(0)
    expect(body.max_tokens).toBe(100)
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'result', strict: true, schema: { type: 'object' } },
    })
  })

  it('throws on non-JSON body when jsonSchema requested', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'not json' } }],
      }),
    )
    const p = new OpenAIProvider({
      apiKey: 'sk-test',
      baseUrl: 'http://test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      p.generate({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        jsonSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/non-JSON/)
  })

  it('translates multimodal content to image_url parts', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] }),
    )
    const p = new OpenAIProvider({
      apiKey: 'sk-test',
      baseUrl: 'http://test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await p.generate({
      model: 'gpt-4o',
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
    const body = JSON.parse(
      (fetchImpl.mock.calls[0]![1] as RequestInit).body as string,
    )
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'describe' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ])
  })

  it('parses tool_calls and JSON-decodes their arguments', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  function: {
                    name: 'search',
                    arguments: '{"query":"hello"}',
                  },
                },
              ],
            },
          },
        ],
      }),
    )
    const p = new OpenAIProvider({
      apiKey: 'sk-test',
      baseUrl: 'http://test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const r = await p.generate({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'find it' }],
      tools: [
        {
          name: 'search',
          description: 'do a search',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
    })
    expect(r.toolCalls).toEqual([
      { name: 'search', arguments: { query: 'hello' } },
    ])
  })

  it('surfaces HTTP errors with status + truncated body', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 503 }))
    const p = new OpenAIProvider({
      apiKey: 'sk-test',
      baseUrl: 'http://test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      p.generate({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/OpenAI 503/)
  })
})
