import { describe, expect, it, vi } from 'vitest'
import { AnthropicProvider } from './anthropic'

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'content-type': 'application/json' },
  })
}

describe('AnthropicProvider', () => {
  it('throws on construct without apiKey or env', () => {
    const old = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      expect(() => new AnthropicProvider({})).toThrow(/ANTHROPIC_API_KEY/)
    } finally {
      if (old !== undefined) process.env.ANTHROPIC_API_KEY = old
    }
  })

  it('synthesizes structured output via a forced `result` tool call', async () => {
    // The Anthropic Messages API has no direct json_schema mode — we
    // expose the schema as a tool's input_schema and force tool_choice.
    // Verify the request body wires that up AND that the `input` of
    // the returned tool_use block is unwrapped into result.json.
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'result',
            input: {
              needsReply: true,
              reason: 'asks for sign-off',
              urgency: 0.7,
            },
          },
        ],
        usage: { input_tokens: 12, output_tokens: 18 },
      }),
    )
    const p = new AnthropicProvider({
      apiKey: 'sk-ant-test',
      baseUrl: 'http://test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const r = await p.generate({
      model: 'claude-haiku-4-5',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      jsonSchema: { type: 'object' },
      maxTokens: 200,
    })

    expect(r.json).toEqual({
      needsReply: true,
      reason: 'asks for sign-off',
      urgency: 0.7,
    })
    expect(r.usage).toEqual({ promptTokens: 12, completionTokens: 18 })

    const init = fetchImpl.mock.calls[0]![1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-test')
    expect(headers['anthropic-version']).toBeDefined()
    const body = JSON.parse(init.body as string)
    expect(body.system).toBe('sys')
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.tools[0].name).toBe('result')
    expect(body.tools[0].input_schema).toEqual({ type: 'object' })
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'result' })
    expect(body.max_tokens).toBe(200)
  })

  it('throws when jsonSchema is requested but the model emits no tool call', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ content: [{ type: 'text', text: 'no schema for you' }] }),
    )
    const p = new AnthropicProvider({
      apiKey: 'sk-ant-test',
      baseUrl: 'http://test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      p.generate({
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: 'hi' }],
        jsonSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/no `result` tool call/)
  })

  it('returns plain text when jsonSchema is absent', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        content: [{ type: 'text', text: 'hello world' }],
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
    )
    const p = new AnthropicProvider({
      apiKey: 'sk-ant-test',
      baseUrl: 'http://test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const r = await p.generate({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.text).toBe('hello world')
    expect(r.json).toBeUndefined()
  })

  it('surfaces HTTP errors with status + truncated body', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 503 }))
    const p = new AnthropicProvider({
      apiKey: 'sk-ant-test',
      baseUrl: 'http://test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(
      p.generate({
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/Anthropic 503/)
  })
})
