import { describe, expect, it } from 'vitest'
import { app } from './app.js'

describe('API Health', () => {
  it('GET / returns API info', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('WistMail API')
    expect(body.version).toBe('0.1.0')
    expect(body.status).toBe('healthy')
  })

  it('GET /health returns ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })
})

describe('Email API', () => {
  const authHeaders = { Authorization: 'Bearer wm_test_key_1234567890abcdef' }

  it('POST /api/v1/emails sends an email', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Hello</p>',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toMatch(/^eml_/)
  })

  it('POST /api/v1/emails validates required fields', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/v1/emails validates email format', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'sender@example.com',
        to: 'not-an-email',
        subject: 'Test',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/v1/emails accepts array of recipients', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'sender@example.com',
        to: ['a@example.com', 'b@example.com'],
        subject: 'Test',
        text: 'Hello',
      }),
    })
    expect(res.status).toBe(201)
  })

  it('POST /api/v1/emails/batch sends multiple emails', async () => {
    const res = await app.request('/api/v1/emails/batch', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emails: [
          { from: 'a@example.com', to: 'b@example.com', subject: 'Test 1' },
          { from: 'a@example.com', to: 'c@example.com', subject: 'Test 2' },
        ],
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ids).toHaveLength(2)
    expect(body.ids[0]).toMatch(/^eml_/)
  })

  it('requires authentication', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'a@example.com',
        to: 'b@example.com',
        subject: 'Test',
      }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects invalid API key format', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'a@example.com',
        to: 'b@example.com',
        subject: 'Test',
      }),
    })
    expect(res.status).toBe(401)
  })
})

describe('Domain API', () => {
  const authHeaders = { Authorization: 'Bearer wm_test_key_1234567890abcdef' }

  it('POST /api/v1/domains creates a domain', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'example.com' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toMatch(/^dom_/)
    expect(body.name).toBe('example.com')
    expect(body.status).toBe('pending')
    expect(body.records).toHaveLength(4) // MX, SPF, DKIM, DMARC
  })

  it('POST /api/v1/domains validates domain format', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'not a domain' }),
    })
    expect(res.status).toBe(400)
  })

  it('GET /api/v1/domains lists domains', async () => {
    const res = await app.request('/api/v1/domains', {
      headers: authHeaders,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeInstanceOf(Array)
  })
})

describe('API Key API', () => {
  const authHeaders = { Authorization: 'Bearer wm_test_key_1234567890abcdef' }

  it('POST /api/v1/api-keys creates a key', async () => {
    const res = await app.request('/api/v1/api-keys', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Key',
        scopes: ['emails:send'],
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.key).toMatch(/^wm_/)
    expect(body.name).toBe('Test Key')
    expect(body.scopes).toContain('emails:send')
  })

  it('GET /api/v1/api-keys lists keys', async () => {
    const res = await app.request('/api/v1/api-keys', {
      headers: authHeaders,
    })
    expect(res.status).toBe(200)
  })
})

describe('Webhook API', () => {
  const authHeaders = { Authorization: 'Bearer wm_test_key_1234567890abcdef' }

  it('POST /api/v1/webhooks creates a webhook', async () => {
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/webhook',
        events: ['email.sent', 'email.delivered'],
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toMatch(/^whk_/)
    expect(body.secret).toMatch(/^whsec_/)
    expect(body.events).toHaveLength(2)
  })

  it('validates webhook URL', async () => {
    const res = await app.request('/api/v1/webhooks', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'not-a-url',
        events: ['email.sent'],
      }),
    })
    expect(res.status).toBe(400)
  })
})

describe('Template API', () => {
  const authHeaders = { Authorization: 'Bearer wm_test_key_1234567890abcdef' }

  it('POST /api/v1/templates creates a template', async () => {
    const res = await app.request('/api/v1/templates', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Welcome Email',
        subject: 'Welcome {{name}}!',
        html: '<h1>Welcome {{name}}!</h1>',
        variables: [{ name: 'name', required: true }],
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toMatch(/^tpl_/)
    expect(body.name).toBe('Welcome Email')
  })
})

describe('Audience API', () => {
  const authHeaders = { Authorization: 'Bearer wm_test_key_1234567890abcdef' }

  it('POST /api/v1/audiences creates an audience', async () => {
    const res = await app.request('/api/v1/audiences', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Newsletter Subscribers' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toMatch(/^aud_/)
    expect(body.name).toBe('Newsletter Subscribers')
  })
})

describe('Analytics API', () => {
  const authHeaders = { Authorization: 'Bearer wm_test_key_1234567890abcdef' }

  it('GET /api/v1/analytics/overview returns stats', async () => {
    const res = await app.request('/api/v1/analytics/overview', {
      headers: authHeaders,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totals).toBeDefined()
    expect(body.rates).toBeDefined()
  })
})

describe('Error Handling', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/api/v1/nonexistent')
    expect(res.status).toBe(404)
  })
})
