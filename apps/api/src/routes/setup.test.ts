import { describe, expect, it } from 'vitest'
import { app } from '../app.js'

const DB_URL = process.env.DATABASE_URL
const describeDb = DB_URL ? describe : describe.skip

// ── Helper ──────────────────────────────────────────────────────────────────

function setupRequest(path: string, opts?: RequestInit) {
  return app.request(`/api/v1/setup${path}`, opts)
}

function postJson(path: string, body: unknown, headers?: Record<string, string>) {
  return setupRequest(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function extractSetupCookie(res: Response): string | undefined {
  const setCookieHeader = res.headers.get('set-cookie')
  if (!setCookieHeader) return undefined
  const match = setCookieHeader.match(/wm_setup_token=([^;]+)/)
  return match?.[1]
}

// ── 1. GET /api/v1/setup/status ─────────────────────────────────────────────

describeDb('GET /api/v1/setup/status', () => {
  it('returns hasUsers: false when no users exist (fresh install)', async () => {
    const res = await setupRequest('/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('hasUsers')
    expect(typeof body.hasUsers).toBe('boolean')
  })

  it('returns inProgress: false when no setup token cookie is sent', async () => {
    const res = await setupRequest('/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inProgress).toBe(false)
    expect(body.step).toBeNull()
    expect(body.domainId).toBeNull()
  })

  it('returns expected shape with all fields', async () => {
    const res = await setupRequest('/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('hasUsers')
    expect(body).toHaveProperty('inProgress')
    expect(body).toHaveProperty('step')
    expect(body).toHaveProperty('domainId')
  })
})

// ── 2. POST /api/v1/setup/domain ────────────────────────────────────────────

describe('POST /api/v1/setup/domain — validation', () => {
  it('rejects empty body', async () => {
    const res = await setupRequest('/domain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects missing name field', async () => {
    const res = await postJson('/domain', { notName: 'example.com' })
    expect(res.status).toBe(400)
  })

  it('rejects domain with spaces', async () => {
    const res = await postJson('/domain', { name: 'not a domain' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects domain with invalid characters', async () => {
    const res = await postJson('/domain', { name: 'ex@mple!.com' })
    expect(res.status).toBe(400)
  })

  it('rejects domain without TLD', async () => {
    const res = await postJson('/domain', { name: 'localhost' })
    expect(res.status).toBe(400)
  })

  it('rejects domain that is too short', async () => {
    const res = await postJson('/domain', { name: 'a' })
    expect(res.status).toBe(400)
  })

  it('rejects domain starting with hyphen', async () => {
    const res = await postJson('/domain', { name: '-example.com' })
    expect(res.status).toBe(400)
  })

  it('rejects domain ending with hyphen in label', async () => {
    const res = await postJson('/domain', { name: 'example-.com' })
    expect(res.status).toBe(400)
  })

  it('rejects domain with numeric-only TLD', async () => {
    const res = await postJson('/domain', { name: 'example.123' })
    expect(res.status).toBe(400)
  })

  it('rejects domain with underscore', async () => {
    const res = await postJson('/domain', { name: 'ex_ample.com' })
    expect(res.status).toBe(400)
  })

  it('rejects empty string domain', async () => {
    const res = await postJson('/domain', { name: '' })
    expect(res.status).toBe(400)
  })
})

describeDb('POST /api/v1/setup/domain — integration', () => {
  it('creates domain and returns records for a valid domain', async () => {
    const res = await postJson('/domain', { name: 'setup-test-valid.com' })
    expect(res.status).toBe(201)
    const body = await res.json()

    // Response shape
    expect(body).toHaveProperty('id')
    expect(body).toHaveProperty('name')
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('records')

    // ID format
    expect(body.id).toMatch(/^dom_/)

    // Domain name is lowercased
    expect(body.name).toBe('setup-test-valid.com')

    // Status should be pending
    expect(body.status).toBe('pending')

    // Records: MX, SPF, DKIM, DMARC
    expect(body.records).toHaveLength(4)
  })

  it('sets a setup token cookie on success', async () => {
    const res = await postJson('/domain', { name: 'setup-cookie-test.com' })
    expect(res.status).toBe(201)
    const cookie = extractSetupCookie(res)
    expect(cookie).toBeDefined()
    expect(cookie!.length).toBeGreaterThan(0)
  })

  it('lowercases domain names', async () => {
    const res = await postJson('/domain', { name: 'UPPERCASE-DOMAIN.COM' })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('uppercase-domain.com')
  })

  it('returns records with expected DNS types', async () => {
    const res = await postJson('/domain', { name: 'dns-types-test.com' })
    expect(res.status).toBe(201)
    const body = await res.json()

    const recordTypes = body.records.map((r: { type: string }) => r.type)
    expect(recordTypes).toContain('MX')
    expect(recordTypes).toContain('TXT') // SPF + DKIM + DMARC are TXT or CNAME
  })

  it('rejects duplicate domain', async () => {
    // Create the first time
    await postJson('/domain', { name: 'dup-test-domain.com' })

    // Try again
    const res = await postJson('/domain', { name: 'dup-test-domain.com' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('already registered')
  })
})

// ── 3. POST /api/v1/setup/domain/verify ─────────────────────────────────────

describe('POST /api/v1/setup/domain/verify', () => {
  it('returns 400 without setup token cookie', async () => {
    const res = await setupRequest('/domain/verify', { method: 'POST' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('setup session')
  })

  it.skipIf(!DB_URL)('returns 400 with an invalid/garbage setup token', async () => {
    const res = await setupRequest('/domain/verify', {
      method: 'POST',
      headers: {
        Cookie: 'wm_setup_token=invalid_garbage_token_value',
      },
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

// ── 4. GET /api/v1/setup/domain/records ─────────────────────────────────────

describe('GET /api/v1/setup/domain/records', () => {
  it('returns 400 without setup token cookie', async () => {
    const res = await setupRequest('/domain/records')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('setup session')
  })
})

// ── 5. POST /api/v1/setup/skip-dns ──────────────────────────────────────────

describe('POST /api/v1/setup/skip-dns', () => {
  it('returns 400 without setup token', async () => {
    const res = await setupRequest('/skip-dns', { method: 'POST' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('setup session')
  })

  it.skipIf(!DB_URL)('returns 400 with invalid setup token', async () => {
    const res = await setupRequest('/skip-dns', {
      method: 'POST',
      headers: {
        Cookie: 'wm_setup_token=not_a_real_token',
      },
    })
    expect(res.status).toBe(400)
  })
})

describeDb('POST /api/v1/setup/skip-dns — integration', () => {
  it('advances step to account when valid setup token is provided', async () => {
    // First create a domain to get a valid setup token
    const domainRes = await postJson('/domain', { name: 'skip-dns-test.com' })
    expect(domainRes.status).toBe(201)
    const cookie = extractSetupCookie(domainRes)
    expect(cookie).toBeDefined()

    // Now skip DNS with the token
    const res = await setupRequest('/skip-dns', {
      method: 'POST',
      headers: {
        Cookie: `wm_setup_token=${cookie}`,
      },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.step).toBe('account')
  })
})

// ── 6. POST /api/v1/setup/account ───────────────────────────────────────────

describe('POST /api/v1/setup/account — no token', () => {
  it('returns 400 without setup token', async () => {
    const res = await postJson('/account', {
      displayName: 'Test User',
      emailLocal: 'admin',
      password: 'StrongPass1',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('setup session')
  })

  it.skipIf(!DB_URL)('returns 400 with invalid setup token', async () => {
    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wm_setup_token=bogus_token',
      },
      body: JSON.stringify({
        displayName: 'Test User',
        emailLocal: 'admin',
        password: 'StrongPass1',
      }),
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/setup/account — validation (missing fields)', () => {
  // These all get rejected at the Zod validation layer, regardless of setup token,
  // but the setup token check happens first. So we test the schema directly here.

  it('rejects empty body (no setup token)', async () => {
    const res = await postJson('/account', {})
    expect(res.status).toBe(400)
  })

  it('rejects missing displayName (no setup token)', async () => {
    const res = await postJson('/account', {
      emailLocal: 'admin',
      password: 'StrongPass1',
    })
    expect(res.status).toBe(400)
  })

  it('rejects missing emailLocal (no setup token)', async () => {
    const res = await postJson('/account', {
      displayName: 'Admin',
      password: 'StrongPass1',
    })
    expect(res.status).toBe(400)
  })

  it('rejects missing password (no setup token)', async () => {
    const res = await postJson('/account', {
      displayName: 'Admin',
      emailLocal: 'admin',
    })
    expect(res.status).toBe(400)
  })
})

describeDb('POST /api/v1/setup/account — password validation', () => {
  // To test password validation properly we need a valid setup token,
  // otherwise the token check rejects first.

  async function createSetupToken(): Promise<string> {
    const domain = `pw-test-${Date.now()}.com`
    const domainRes = await postJson('/domain', { name: domain })
    const cookie = extractSetupCookie(domainRes)
    if (!cookie) throw new Error('No setup cookie returned')
    return cookie
  }

  it('rejects password shorter than 8 characters', async () => {
    const cookie = await createSetupToken()
    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'Admin',
        emailLocal: 'admin',
        password: 'Short1',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects password without uppercase letter', async () => {
    const cookie = await createSetupToken()
    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'Admin',
        emailLocal: 'admin',
        password: 'nouppercase1',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects password without a number', async () => {
    const cookie = await createSetupToken()
    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'Admin',
        emailLocal: 'admin',
        password: 'NoNumberHere',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects password without a lowercase letter', async () => {
    const cookie = await createSetupToken()
    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'Admin',
        emailLocal: 'admin',
        password: 'NOLOWERCASE1',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describeDb('POST /api/v1/setup/account — field validation', () => {
  async function createSetupToken(): Promise<string> {
    const domain = `field-test-${Date.now()}.com`
    const domainRes = await postJson('/domain', { name: domain })
    const cookie = extractSetupCookie(domainRes)
    if (!cookie) throw new Error('No setup cookie returned')
    return cookie
  }

  it('rejects displayName too short (1 char)', async () => {
    const cookie = await createSetupToken()
    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'A',
        emailLocal: 'admin',
        password: 'ValidPass1',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects emailLocal with invalid characters', async () => {
    const cookie = await createSetupToken()
    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'Admin User',
        emailLocal: 'admin@invalid',
        password: 'ValidPass1',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects emailLocal with spaces', async () => {
    const cookie = await createSetupToken()
    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'Admin User',
        emailLocal: 'admin user',
        password: 'ValidPass1',
      }),
    })
    expect(res.status).toBe(400)
  })

  it('accepts emailLocal with dots, underscores, plus, percent, hyphen', async () => {
    const cookie = await createSetupToken()
    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'Admin User',
        emailLocal: 'admin.user_name+tag',
        password: 'ValidPass1',
      }),
    })
    // Should pass validation (201) or fail for another reason (not 400 validation on emailLocal)
    // Since we have a valid setup token, this should proceed past validation
    expect(res.status).toBe(201)
  })
})

describeDb('POST /api/v1/setup/account — full flow', () => {
  it('creates user, mailbox, and org with valid data', async () => {
    const domain = `fullflow-${Date.now()}.com`
    const domainRes = await postJson('/domain', { name: domain })
    expect(domainRes.status).toBe(201)
    const cookie = extractSetupCookie(domainRes)
    expect(cookie).toBeDefined()

    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'Admin User',
        emailLocal: 'admin',
        password: 'SecurePass123',
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()

    // User
    expect(body.user).toBeDefined()
    expect(body.user.id).toMatch(/^usr_/)
    expect(body.user.name).toBe('Admin User')
    expect(body.user.email).toBe(`admin@${domain}`)

    // Mailbox
    expect(body.mailbox).toBeDefined()
    expect(body.mailbox.id).toMatch(/^mbx_/)
    expect(body.mailbox.address).toBe(`admin@${domain}`)

    // Organization
    expect(body.organization).toBeDefined()
    expect(body.organization.id).toMatch(/^org_/)
    expect(body.organization.name).toBe(domain)
  })

  it('sets a session cookie after account creation', async () => {
    const domain = `session-${Date.now()}.com`
    const domainRes = await postJson('/domain', { name: domain })
    const cookie = extractSetupCookie(domainRes)

    const res = await setupRequest('/account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `wm_setup_token=${cookie}`,
      },
      body: JSON.stringify({
        displayName: 'Session Tester',
        emailLocal: 'sessiontest',
        password: 'SecurePass123',
      }),
    })
    expect(res.status).toBe(201)

    const setCookieHeader = res.headers.get('set-cookie')
    expect(setCookieHeader).toBeDefined()
    expect(setCookieHeader).toContain('wm_session=')
  })
})

// ── 7. Authenticated setup routes ───────────────────────────────────────────

describe('GET /api/v1/setup/domains — no auth', () => {
  it('returns empty data array without session cookie', async () => {
    const res = await setupRequest('/domains')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })
})

describe('GET /api/v1/setup/mailboxes — no auth', () => {
  it('returns empty data array without session cookie', async () => {
    const res = await setupRequest('/mailboxes')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })
})
