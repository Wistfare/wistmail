import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  WistfareClient,
  BillingProviderError,
  __resetWistfareClient,
} from './wistfare-client.js'

describe('WistfareClient', () => {
  beforeEach(() => {
    __resetWistfareClient()
  })

  it('returns a stubbed response when no API key is configured', async () => {
    const client = new WistfareClient({ apiKey: '' })
    const r = await client.initiateCollection({
      businessId: 'biz_1',
      walletId: 'wal_1',
      customerPhone: '250788000000',
      amount: '10000',
      paymentMethod: 'mtn_momo',
      currency: 'RWF',
      referenceId: 'idem_test_1',
    })
    expect(r.status).toBe('pending')
    expect(r.id).toContain('stub')
    expect(r.referenceId).toBe('idem_test_1')
  })

  it('stubs in test env even when an apiKey is given', async () => {
    // We're running under VITEST, so even with a key the client should stub.
    const client = new WistfareClient({ apiKey: 'wf_live_xxx' })
    expect(client.stubbed).toBe(true)
  })

  it('posts the expected URL/headers/body when stubbing is disabled', async () => {
    // Force out of stub mode by clearing the env flag for this test.
    const origVitest = process.env.VITEST
    const origNode = process.env.NODE_ENV
    delete process.env.VITEST
    process.env.NODE_ENV = 'production'

    try {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'col_real_1',
            businessId: 'biz_1',
            walletId: 'wal_1',
            customerPhone: '250788000000',
            amount: '10000',
            currency: 'RWF',
            paymentMethod: 'mtn_momo',
            referenceId: 'idem_test_2',
            status: 'pending',
            createdAt: '2026-05-10T00:00:00Z',
            updatedAt: '2026-05-10T00:00:00Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

      const client = new WistfareClient({
        apiKey: 'wf_live_xxx',
        apiUrl: 'https://api.example.test',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
      const r = await client.initiateCollection({
        businessId: 'biz_1',
        walletId: 'wal_1',
        customerPhone: '250788000000',
        amount: '10000',
        paymentMethod: 'mtn_momo',
        currency: 'RWF',
        referenceId: 'idem_test_2',
      })
      expect(r.id).toBe('col_real_1')
      expect(fetchImpl).toHaveBeenCalledOnce()
      const [url, init] = fetchImpl.mock.calls[0]
      expect(url).toBe('https://api.example.test/v1/collections')
      expect(init.method).toBe('POST')
      const headers = init.headers as Record<string, string>
      expect(headers['X-API-Key']).toBe('wf_live_xxx')
      expect(headers['Content-Type']).toBe('application/json')
      const body = JSON.parse(init.body as string)
      expect(body.referenceId).toBe('idem_test_2')
    } finally {
      if (origVitest) process.env.VITEST = origVitest
      if (origNode) process.env.NODE_ENV = origNode
      else delete process.env.NODE_ENV
    }
  })

  it('throws BillingProviderError on non-2xx', async () => {
    const origVitest = process.env.VITEST
    const origNode = process.env.NODE_ENV
    delete process.env.VITEST
    process.env.NODE_ENV = 'production'

    try {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'bad msisdn' }), { status: 400 }),
      )
      const client = new WistfareClient({
        apiKey: 'wf_live_xxx',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
      await expect(
        client.initiateCollection({
          businessId: 'biz_1',
          walletId: 'wal_1',
          customerPhone: 'bad',
          amount: '0',
          paymentMethod: 'mtn_momo',
          currency: 'RWF',
          referenceId: 'idem_x',
        }),
      ).rejects.toBeInstanceOf(BillingProviderError)
    } finally {
      if (origVitest) process.env.VITEST = origVitest
      if (origNode) process.env.NODE_ENV = origNode
      else delete process.env.NODE_ENV
    }
  })
})
