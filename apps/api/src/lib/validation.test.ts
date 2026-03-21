import { describe, expect, it } from 'vitest'
import {
  sendEmailSchema,
  batchSendSchema,
  createDomainSchema,
  createApiKeySchema,
  createWebhookSchema,
  createTemplateSchema,
  createAudienceSchema,
  createContactSchema,
} from './validation.js'

describe('sendEmailSchema', () => {
  it('accepts valid email with string to', () => {
    const result = sendEmailSchema.safeParse({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid email with array to', () => {
    const result = sendEmailSchema.safeParse({
      from: 'sender@example.com',
      to: ['a@example.com', 'b@example.com'],
      subject: 'Test',
      html: '<p>Hello</p>',
    })
    expect(result.success).toBe(true)
  })

  it('accepts email with all optional fields', () => {
    const result = sendEmailSchema.safeParse({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      cc: ['cc@example.com'],
      bcc: 'bcc@example.com',
      subject: 'Test',
      html: '<p>Hello</p>',
      text: 'Hello',
      replyTo: 'reply@example.com',
      headers: { 'X-Custom': 'value' },
      tags: { campaign: 'launch' },
      scheduledAt: '2024-12-01T10:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing from', () => {
    const result = sendEmailSchema.safeParse({
      to: 'recipient@example.com',
      subject: 'Test',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid to email', () => {
    const result = sendEmailSchema.safeParse({
      from: 'sender@example.com',
      to: 'not-an-email',
      subject: 'Test',
    })
    expect(result.success).toBe(false)
  })

  it('rejects too long subject', () => {
    const result = sendEmailSchema.safeParse({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'a'.repeat(999),
    })
    expect(result.success).toBe(false)
  })
})

describe('batchSendSchema', () => {
  it('accepts valid batch', () => {
    const result = batchSendSchema.safeParse({
      emails: [
        { from: 'a@ex.com', to: 'b@ex.com', subject: 'Test 1' },
        { from: 'a@ex.com', to: 'c@ex.com', subject: 'Test 2' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty batch', () => {
    const result = batchSendSchema.safeParse({ emails: [] })
    expect(result.success).toBe(false)
  })
})

describe('createDomainSchema', () => {
  it('accepts valid domain', () => {
    expect(createDomainSchema.safeParse({ name: 'example.com' }).success).toBe(true)
    expect(createDomainSchema.safeParse({ name: 'sub.example.com' }).success).toBe(true)
  })

  it('rejects invalid domain', () => {
    expect(createDomainSchema.safeParse({ name: 'not a domain' }).success).toBe(false)
    expect(createDomainSchema.safeParse({ name: '' }).success).toBe(false)
    expect(createDomainSchema.safeParse({ name: '-invalid.com' }).success).toBe(false)
  })
})

describe('createApiKeySchema', () => {
  it('accepts valid API key request', () => {
    const result = createApiKeySchema.safeParse({
      name: 'My API Key',
      scopes: ['emails:send', 'emails:read'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid scopes', () => {
    const result = createApiKeySchema.safeParse({
      name: 'My Key',
      scopes: ['invalid:scope'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty scopes', () => {
    const result = createApiKeySchema.safeParse({
      name: 'My Key',
      scopes: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('createWebhookSchema', () => {
  it('accepts valid webhook', () => {
    const result = createWebhookSchema.safeParse({
      url: 'https://example.com/webhook',
      events: ['email.sent', 'email.bounced'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid URL', () => {
    const result = createWebhookSchema.safeParse({
      url: 'not-a-url',
      events: ['email.sent'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid events', () => {
    const result = createWebhookSchema.safeParse({
      url: 'https://example.com/webhook',
      events: ['invalid.event'],
    })
    expect(result.success).toBe(false)
  })
})

describe('createTemplateSchema', () => {
  it('accepts valid template', () => {
    const result = createTemplateSchema.safeParse({
      name: 'Welcome',
      subject: 'Welcome {{name}}!',
      html: '<h1>Welcome!</h1>',
    })
    expect(result.success).toBe(true)
  })

  it('accepts template with variables', () => {
    const result = createTemplateSchema.safeParse({
      name: 'Welcome',
      subject: 'Hi',
      html: '<p>Hello</p>',
      variables: [{ name: 'name', required: true }],
    })
    expect(result.success).toBe(true)
  })
})

describe('createAudienceSchema', () => {
  it('accepts valid audience', () => {
    expect(createAudienceSchema.safeParse({ name: 'Newsletter' }).success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(createAudienceSchema.safeParse({ name: '' }).success).toBe(false)
  })
})

describe('createContactSchema', () => {
  it('accepts valid contact', () => {
    const result = createContactSchema.safeParse({
      email: 'user@example.com',
      name: 'John Doe',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = createContactSchema.safeParse({
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })
})
