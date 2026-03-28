import { describe, expect, it } from 'vitest'
import { isValidDomain, DKIM_SELECTOR } from '@wistmail/shared'
import { app } from '../app.js'

describe('isValidDomain (from shared package)', () => {
  it('accepts standard domain names', () => {
    expect(isValidDomain('example.com')).toBe(true)
    expect(isValidDomain('wistfare.com')).toBe(true)
    expect(isValidDomain('mail.google.com')).toBe(true)
  })

  it('accepts subdomains', () => {
    expect(isValidDomain('sub.example.com')).toBe(true)
    expect(isValidDomain('deep.sub.example.com')).toBe(true)
  })

  it('accepts domains with hyphens', () => {
    expect(isValidDomain('my-domain.com')).toBe(true)
    expect(isValidDomain('my-cool-domain.org')).toBe(true)
  })

  it('accepts short TLDs', () => {
    expect(isValidDomain('a.co')).toBe(true)
    expect(isValidDomain('example.io')).toBe(true)
  })

  it('rejects empty strings', () => {
    expect(isValidDomain('')).toBe(false)
  })

  it('rejects single-label domains (no TLD)', () => {
    expect(isValidDomain('localhost')).toBe(false)
  })

  it('rejects domains starting with hyphens', () => {
    expect(isValidDomain('-invalid.com')).toBe(false)
  })

  it('rejects domains exceeding max length', () => {
    const longDomain = 'a'.repeat(254) + '.com'
    expect(isValidDomain(longDomain)).toBe(false)
  })

  it('rejects domains with spaces', () => {
    expect(isValidDomain('not a domain')).toBe(false)
    expect(isValidDomain('has space.com')).toBe(false)
  })

  it('rejects domains with special characters', () => {
    expect(isValidDomain('domain!.com')).toBe(false)
    expect(isValidDomain('domain@.com')).toBe(false)
  })
})

describe('DKIM_SELECTOR constant', () => {
  it('is defined and is a non-empty string', () => {
    expect(DKIM_SELECTOR).toBe('wistmail')
    expect(DKIM_SELECTOR.length).toBeGreaterThan(0)
  })
})

describe('Domain Routes - DNS Record Generation', () => {
  const authHeaders = { 'X-API-Key': 'wm_domain_test_key_abc123' }

  it('POST /api/v1/domains returns 4 DNS records (MX, SPF, DKIM, DMARC)', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'testdomain.com' }),
    })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.records).toHaveLength(4)

    // Check record types
    const types = body.records.map((r: { type: string }) => r.type)
    expect(types).toContain('MX')
    expect(types.filter((t: string) => t === 'TXT')).toHaveLength(3) // SPF, DKIM, DMARC
  })

  it('MX record points to mail subdomain', async () => {
    const domain = 'mxcheck.com'
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    })
    const body = await res.json()

    const mxRecord = body.records.find((r: { type: string }) => r.type === 'MX')
    expect(mxRecord).toBeDefined()
    expect(mxRecord.value).toContain(`mail.${domain}`)
    expect(mxRecord.priority).toBe(10)
    expect(mxRecord.name).toBe(domain)
  })

  it('SPF record has correct format', async () => {
    const domain = 'spfcheck.com'
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    })
    const body = await res.json()

    const spfRecord = body.records.find(
      (r: { type: string; value: string }) => r.type === 'TXT' && r.value.startsWith('v=spf1'),
    )
    expect(spfRecord).toBeDefined()
    expect(spfRecord.name).toBe(domain)
    expect(spfRecord.value).toContain('v=spf1')
  })

  it('DKIM record uses correct selector subdomain', async () => {
    const domain = 'dkimcheck.com'
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    })
    const body = await res.json()

    const dkimRecord = body.records.find(
      (r: { type: string; name: string }) =>
        r.type === 'TXT' && r.name.includes('_domainkey'),
    )
    expect(dkimRecord).toBeDefined()
    expect(dkimRecord.name).toContain(`._domainkey.${domain}`)
  })

  it('DMARC record uses _dmarc subdomain with correct format', async () => {
    const domain = 'dmarccheck.com'
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: domain }),
    })
    const body = await res.json()

    const dmarcRecord = body.records.find(
      (r: { type: string; name: string }) =>
        r.type === 'TXT' && r.name.startsWith('_dmarc.'),
    )
    expect(dmarcRecord).toBeDefined()
    expect(dmarcRecord.name).toBe(`_dmarc.${domain}`)
    expect(dmarcRecord.value).toContain('v=DMARC1')
    expect(dmarcRecord.value).toContain('p=')
  })

  it('all records have verified: false initially', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'verifiedcheck.com' }),
    })
    const body = await res.json()

    for (const record of body.records) {
      expect(record.verified).toBe(false)
    }
  })

  it('returns domain with pending status', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'statuscheck.com' }),
    })
    const body = await res.json()

    expect(body.status).toBe('pending')
    expect(body.id).toMatch(/^dom_/)
    expect(body.name).toBe('statuscheck.com')
  })
})

describe('Domain Routes - Validation', () => {
  const authHeaders = { 'X-API-Key': 'wm_domain_validation_key' }

  it('rejects invalid domain format', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'not a domain' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects domain with spaces', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'has space.com' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects empty domain name', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects missing name field', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('requires authentication for domain operations', async () => {
    const res = await app.request('/api/v1/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'example.com' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('Domain Routes - DNS Check Error Handling', () => {
  const authHeaders = { 'X-API-Key': 'wm_dns_check_test_key' }

  it('GET /api/v1/domains lists domains without error', async () => {
    const res = await app.request('/api/v1/domains', {
      headers: authHeaders,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeInstanceOf(Array)
  })

  it('GET /api/v1/domains/:id returns 404 for non-existent domain', async () => {
    const res = await app.request('/api/v1/domains/dom_nonexistent_123', {
      headers: authHeaders,
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('POST /api/v1/domains/:id/verify returns 404 for non-existent domain', async () => {
    const res = await app.request('/api/v1/domains/dom_fake_id/verify', {
      method: 'POST',
      headers: authHeaders,
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
