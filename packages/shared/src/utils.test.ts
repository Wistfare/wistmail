import { describe, expect, it } from 'vitest'
import {
  isValidEmail,
  isValidDomain,
  extractDomain,
  extractLocalPart,
  normalizeEmail,
  truncate,
  formatBytes,
  generateId,
  generateApiKey,
  generateMessageId,
  generateWebhookSecret,
  toArray,
  toRfc2822,
  computeHmac,
  verifyWebhookSignature,
} from './utils.js'
import { API_KEY_PREFIX } from './constants.js'

describe('isValidEmail', () => {
  it('accepts valid email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
    expect(isValidEmail('user.name@example.com')).toBe(true)
    expect(isValidEmail('user+tag@example.com')).toBe(true)
    expect(isValidEmail('user@sub.domain.com')).toBe(true)
    expect(isValidEmail('a@b.co')).toBe(true)
  })

  it('rejects invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('user@')).toBe(false)
    expect(isValidEmail('user @example.com')).toBe(false)
    expect(isValidEmail('a'.repeat(255) + '@example.com')).toBe(false)
  })
})

describe('isValidDomain', () => {
  it('accepts valid domains', () => {
    expect(isValidDomain('example.com')).toBe(true)
    expect(isValidDomain('sub.example.com')).toBe(true)
    expect(isValidDomain('my-domain.org')).toBe(true)
    expect(isValidDomain('a.co')).toBe(true)
  })

  it('rejects invalid domains', () => {
    expect(isValidDomain('')).toBe(false)
    expect(isValidDomain('localhost')).toBe(false)
    expect(isValidDomain('-invalid.com')).toBe(false)
    expect(isValidDomain('a'.repeat(254) + '.com')).toBe(false)
  })
})

describe('extractDomain', () => {
  it('extracts domain from email', () => {
    expect(extractDomain('user@example.com')).toBe('example.com')
    expect(extractDomain('USER@EXAMPLE.COM')).toBe('example.com')
  })
})

describe('extractLocalPart', () => {
  it('extracts local part from email', () => {
    expect(extractLocalPart('user@example.com')).toBe('user')
    expect(extractLocalPart('user.name+tag@example.com')).toBe('user.name+tag')
  })
})

describe('normalizeEmail', () => {
  it('normalizes email address', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com')
  })
})

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates long strings with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...')
  })

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })
})

describe('formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1048576)).toBe('1.0 MB')
    expect(formatBytes(1073741824)).toBe('1.0 GB')
    expect(formatBytes(500)).toBe('500 B')
  })
})

describe('generateId', () => {
  it('generates prefixed IDs', () => {
    const id = generateId('usr')
    expect(id).toMatch(/^usr_[a-f0-9]{32}$/)
  })

  it('generates unique IDs', () => {
    const id1 = generateId('usr')
    const id2 = generateId('usr')
    expect(id1).not.toBe(id2)
  })
})

describe('generateApiKey', () => {
  it('generates API key with correct prefix', () => {
    const { key, prefix } = generateApiKey()
    expect(key).toMatch(new RegExp(`^${API_KEY_PREFIX}[a-f0-9]{64}$`))
    expect(prefix).toBe(key.slice(0, 10))
  })
})

describe('generateWebhookSecret', () => {
  it('generates webhook secret with correct prefix', () => {
    const secret = generateWebhookSecret()
    expect(secret).toMatch(/^whsec_[a-f0-9]{48}$/)
  })
})

describe('generateMessageId', () => {
  it('generates RFC-compliant message ID', () => {
    const id = generateMessageId('example.com')
    expect(id).toMatch(/^<[a-f0-9]{24}@example\.com>$/)
  })
})

describe('toRfc2822', () => {
  it('formats date to RFC 2822', () => {
    const date = new Date('2024-01-15T10:30:00Z')
    const formatted = toRfc2822(date)
    expect(formatted).toContain('2024')
    expect(formatted).toContain('Jan')
  })
})

describe('toArray', () => {
  it('wraps non-array values', () => {
    expect(toArray('hello')).toEqual(['hello'])
    expect(toArray(42)).toEqual([42])
  })

  it('returns arrays unchanged', () => {
    expect(toArray([1, 2, 3])).toEqual([1, 2, 3])
    expect(toArray(['a'])).toEqual(['a'])
  })
})

describe('webhook HMAC', () => {
  it('computes HMAC-SHA256', async () => {
    const hmac = await computeHmac('test-payload', 'test-secret')
    expect(hmac).toMatch(/^[a-f0-9]{64}$/)
  })

  it('verifies valid signatures', async () => {
    const payload = '{"event":"email.sent"}'
    const secret = 'my-secret'
    const signature = await computeHmac(payload, secret)
    expect(await verifyWebhookSignature(payload, signature, secret)).toBe(true)
  })

  it('rejects invalid signatures', async () => {
    const payload = '{"event":"email.sent"}'
    const secret = 'my-secret'
    expect(await verifyWebhookSignature(payload, 'invalid', secret)).toBe(false)
  })
})
