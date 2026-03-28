import { describe, expect, it, vi, beforeEach } from 'vitest'
import { WistMail } from './client.js'
import { AuthenticationError, RateLimitError, ValidationError, NotFoundError } from './errors.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockResponse(status: number, body?: unknown, headers?: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(headers),
  }
}

describe('WistMail SDK', () => {
  let client: WistMail

  beforeEach(() => {
    vi.clearAllMocks()
    client = new WistMail({ apiKey: 'wm_test_key_123', baseUrl: 'http://localhost:3001' })
  })

  describe('constructor', () => {
    it('throws if apiKey is missing', () => {
      expect(() => new WistMail({ apiKey: '' })).toThrow('apiKey is required')
    })

    it('strips trailing slash from baseUrl', () => {
      const c = new WistMail({ apiKey: 'wm_test', baseUrl: 'http://example.com/' })
      expect(c).toBeDefined()
    })

    it('uses default baseUrl if not provided', () => {
      const c = new WistMail({ apiKey: 'wm_test' })
      expect(c).toBeDefined()
    })
  })

  describe('emails.send', () => {
    it('sends an email and returns id', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 'eml_abc123' }))

      const result = await client.emails.send({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      })

      expect(result.id).toBe('eml_abc123')
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/v1/emails')
      expect(opts.method).toBe('POST')
      expect(opts.headers['X-API-Key']).toBe('wm_test_key_123')

      const body = JSON.parse(opts.body)
      expect(body.to).toEqual(['recipient@example.com'])
    })

    it('handles string[] for to field', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 'eml_abc' }))

      await client.emails.send({
        from: 'a@b.com',
        to: ['x@y.com', 'z@w.com'],
        subject: 'Test',
        text: 'hello',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.to).toEqual(['x@y.com', 'z@w.com'])
    })

    it('converts Date scheduledAt to ISO string', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 'eml_abc' }))
      const date = new Date('2026-04-01T12:00:00Z')

      await client.emails.send({
        from: 'a@b.com',
        to: 'x@y.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        scheduledAt: date,
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.scheduledAt).toBe('2026-04-01T12:00:00.000Z')
    })

    it('sends with cc, bcc, replyTo', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 'eml_abc' }))

      await client.emails.send({
        from: 'a@b.com',
        to: 'x@y.com',
        subject: 'Test',
        html: '<p>Hi</p>',
        cc: 'cc@b.com',
        bcc: ['bcc1@b.com', 'bcc2@b.com'],
        replyTo: 'reply@b.com',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.cc).toBe('cc@b.com')
      expect(body.bcc).toEqual(['bcc1@b.com', 'bcc2@b.com'])
    })
  })

  describe('emails.batchSend', () => {
    it('sends batch and returns ids', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(201, { ids: ['eml_1', 'eml_2'] }))

      const result = await client.emails.batchSend([
        { from: 'a@b.com', to: 'x@y.com', subject: 'One', html: '<p>1</p>' },
        { from: 'a@b.com', to: 'z@w.com', subject: 'Two', text: 'two' },
      ])

      expect(result.ids).toEqual(['eml_1', 'eml_2'])
    })
  })

  describe('emails.get', () => {
    it('returns email status', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(200, { id: 'eml_abc', status: 'delivered', from: 'a@b.com', to: ['x@y.com'], subject: 'Test', createdAt: '2026-03-28T00:00:00Z', deliveredAt: '2026-03-28T00:00:01Z', openedAt: null, clickedAt: null, bouncedAt: null }),
      )

      const result = await client.emails.get('eml_abc')
      expect(result.status).toBe('delivered')
    })
  })

  describe('emails.cancel', () => {
    it('cancels a scheduled email', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(204))
      await client.emails.cancel('eml_abc')
      expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
  })

  describe('webhooks', () => {
    it('creates a webhook', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(201, { id: 'whk_abc', url: 'https://example.com/webhook', events: ['email.sent'], secret: 'whsec_abc123', active: true }),
      )

      const result = await client.webhooks.create({ url: 'https://example.com/webhook', events: ['email.sent'] })
      expect(result.id).toBe('whk_abc')
      expect(result.secret).toMatch(/^whsec_/)
    })

    it('tests a webhook', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { status: 200 }))
      const result = await client.webhooks.test('whk_abc')
      expect(result.status).toBe(200)
    })
  })

  describe('audiences', () => {
    it('creates an audience', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(201, { id: 'aud_abc', name: 'Newsletter', contactCount: 0 }),
      )
      const result = await client.audiences.create('Newsletter')
      expect(result.name).toBe('Newsletter')
    })

    it('adds a contact to audience', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(201, { id: 'con_abc', email: 'user@example.com', name: 'User' }),
      )
      const result = await client.audiences.addContact('aud_abc', { email: 'user@example.com', name: 'User' })
      expect(result.email).toBe('user@example.com')
    })
  })

  describe('error handling', () => {
    it('throws AuthenticationError on 401', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } }),
      )
      await expect(client.emails.get('eml_abc')).rejects.toThrow(AuthenticationError)
    })

    it('throws RateLimitError on 429', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { 'Retry-After': '30' }),
      )
      try {
        await client.emails.get('eml_abc')
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError)
        expect((err as RateLimitError).retryAfter).toBe(30)
      }
    })

    it('throws ValidationError on 400', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid email' } }),
      )
      await expect(client.emails.send({ from: '', to: 'x@y.com', subject: 'Hi', html: '<p>test</p>' })).rejects.toThrow(ValidationError)
    })

    it('throws NotFoundError on 404', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(404, { error: { code: 'NOT_FOUND', message: 'Email not found' } }),
      )
      await expect(client.emails.get('eml_nonexistent')).rejects.toThrow(NotFoundError)
    })

    it('handles non-JSON error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 502,
        json: () => Promise.reject(new Error('not json')),
        headers: new Headers(),
      })
      await expect(client.emails.get('eml_abc')).rejects.toThrow('Request failed with status 502')
    })
  })

  describe('request headers', () => {
    it('sends X-API-Key and User-Agent', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { data: [] }))
      await client.audiences.list()

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers['X-API-Key']).toBe('wm_test_key_123')
      expect(headers['User-Agent']).toMatch(/^wistmail-node\//)
    })

    it('sends Content-Type for POST requests', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(201, { id: 'aud_abc', name: 'Test' }))
      await client.audiences.create('Test')

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers['Content-Type']).toBe('application/json')
    })
  })
})
