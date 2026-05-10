/**
 * Unit tests for the billing tick cron entrypoint at
 * `<repo>/scripts/billing-tick-cron.ts`. Lives under the API workspace
 * so it's picked up by `pnpm --filter @wistmail/api test`; the script
 * itself stays at the repo root because that's where the cron
 * Dockerfile expects to find it.
 *
 * Imported via a relative path that hops out of `apps/api`. The script
 * has no runtime imports so this works without TS path config.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  runBillingTick,
  runForever,
} from '../../../../scripts/billing-tick-cron.js'

describe('runBillingTick', () => {
  it('POSTs /api/v1/billing/internal/tick with X-Inbound-Secret', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { transitions: { activated: 0 } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const r = await runBillingTick({
      apiUrl: 'http://api:3001',
      inboundSecret: 'shh-its-a-secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://api:3001/api/v1/billing/internal/tick')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-Inbound-Secret']).toBe('shh-its-a-secret')
    expect(headers['Content-Type']).toBe('application/json')
    expect(init?.body).toBe('{}')
  })

  it("strips a trailing slash from apiUrl so we don't double up the path", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    await runBillingTick({
      apiUrl: 'http://api:3001/',
      inboundSecret: 's',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(fetchImpl.mock.calls[0]![0]).toBe('http://api:3001/api/v1/billing/internal/tick')
  })

  it('returns ok=false on non-2xx without throwing', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'nope' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const r = await runBillingTick({
      apiUrl: 'http://api:3001',
      inboundSecret: 'wrong',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(401)
    expect(r.body).toEqual({ error: 'nope' })
  })

  it('tolerates a non-JSON body', async () => {
    const fetchImpl = vi.fn(async () => new Response('plain text', { status: 200 }))
    const r = await runBillingTick({
      apiUrl: 'http://api:3001',
      inboundSecret: 's',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(r.ok).toBe(true)
    expect(r.body).toBeNull()
  })
})

describe('runForever', () => {
  it('keeps ticking after a network failure on the first attempt', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new Error('boom')
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    let stops = 0
    const sleep = vi.fn(async () => {
      stops += 1
      // Stop after we've slept twice (i.e. after the failed tick + the
      // successful one) by throwing a sentinel out of the loop.
      if (stops >= 2) throw new Error('__stop__')
    })

    await expect(
      runForever({
        apiUrl: 'http://api:3001',
        inboundSecret: 's',
        intervalMs: 1000,
        sleep,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      } as never),
    ).rejects.toThrow('__stop__')

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})
