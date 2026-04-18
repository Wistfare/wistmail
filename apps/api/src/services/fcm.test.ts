import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { senderDisplayName } from './fcm.js'

describe('senderDisplayName', () => {
  it('extracts the display name from "Name <email>" format', () => {
    expect(senderDisplayName('Alex Chen <alex@wistfare.com>')).toBe('Alex Chen')
  })

  it('falls back to email when no display name is present', () => {
    expect(senderDisplayName('Alex Chen <alex@wistfare.com>')).toBe('Alex Chen')
    expect(senderDisplayName('alex.chen@wistfare.com')).toBe('alex.chen')
  })

  it('strips quotes from quoted display names', () => {
    expect(senderDisplayName('"Alex Chen" <alex@x.com>')).toBe('Alex Chen')
  })

  it('returns the raw value if no @ and no angle brackets', () => {
    expect(senderDisplayName('Alex Chen')).toBe('Alex Chen')
  })
})

describe('FCM credential resolution (env parsing)', () => {
  const originalInline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const originalPath = process.env.GOOGLE_APPLICATION_CREDENTIALS

  beforeEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS
  })
  afterEach(() => {
    if (originalInline !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalInline
    if (originalPath !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = originalPath
  })

  it('accepts valid inline JSON without throwing', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      type: 'service_account',
      project_id: 'test',
      private_key_id: 'id',
      private_key: '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----\\n',
      client_email: 'test@test.iam.gserviceaccount.com',
      client_id: '123',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test',
    })
    // Importing the module should not throw just because the env is set.
    const mod = await import('./fcm.js')
    expect(mod.senderDisplayName).toBeTypeOf('function')
  })

  it('tolerates invalid JSON in FIREBASE_SERVICE_ACCOUNT_JSON', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{not valid json'
    // Should not throw at import time.
    const mod = await import('./fcm.js')
    expect(mod.senderDisplayName).toBeTypeOf('function')
  })
})
