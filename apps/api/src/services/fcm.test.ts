import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { users } from '@wistmail/db'
import { getDb } from '../lib/db.js'
import { senderDisplayName, shouldDeliverPush } from './fcm.js'

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

const DB_URL = process.env.DATABASE_URL
const describeIf = DB_URL ? describe : describe.skip

async function seedUser(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = `u_fcm_${randomBytes(3).toString('hex')}`
  const db = getDb()
  await db.insert(users).values({
    id,
    email: `fcm.${randomBytes(2).toString('hex')}@gate-test.example`,
    name: 'Gate',
    passwordHash: 'unused',
    setupComplete: true,
    ...overrides,
  })
  return id
}

describeIf('shouldDeliverPush — focus mode + per-channel prefs', () => {
  it('delivers when focus mode is off and channel pref is unset', async () => {
    const userId = await seedUser()
    const r = await shouldDeliverPush(userId, 'mail')
    expect(r.deliver).toBe(true)
  })

  it('drops mail + chat while focus is on with a future until-time', async () => {
    const userId = await seedUser({
      focusModeEnabled: true,
      focusModeUntil: new Date(Date.now() + 60 * 60 * 1000),
    })
    const mail = await shouldDeliverPush(userId, 'mail')
    expect(mail.deliver).toBe(false)
    expect(mail.reason).toBe('focus-mode')
    const chat = await shouldDeliverPush(userId, 'chat')
    expect(chat.deliver).toBe(false)
  })

  it('lets calendar pierce focus mode', async () => {
    const userId = await seedUser({
      focusModeEnabled: true,
      focusModeUntil: new Date(Date.now() + 60 * 60 * 1000),
    })
    const r = await shouldDeliverPush(userId, 'calendar')
    expect(r.deliver).toBe(true)
  })

  it('treats focus mode as expired once until-time has passed', async () => {
    const userId = await seedUser({
      focusModeEnabled: true,
      focusModeUntil: new Date(Date.now() - 60 * 1000),
    })
    const r = await shouldDeliverPush(userId, 'mail')
    expect(r.deliver).toBe(true)
  })

  it('treats null focus_mode_until as indefinite (still on)', async () => {
    const userId = await seedUser({
      focusModeEnabled: true,
      focusModeUntil: null,
    })
    const r = await shouldDeliverPush(userId, 'mail')
    expect(r.deliver).toBe(false)
    expect(r.reason).toBe('focus-mode')
  })

  it('drops the channel when notification_prefs[channel] is false', async () => {
    const userId = await seedUser()
    // Update prefs to mute chat. notification_prefs ships as JSON;
    // overwrite it explicitly with a known shape.
    await getDb()
      .update(users)
      .set({
        notificationPrefs: sql`'{"mail":true,"chat":false,"calendar":true}'::jsonb`,
      })
      .where(eq(users.id, userId))
    const chat = await shouldDeliverPush(userId, 'chat')
    expect(chat.deliver).toBe(false)
    expect(chat.reason).toBe('channel-muted')
    const mail = await shouldDeliverPush(userId, 'mail')
    expect(mail.deliver).toBe(true)
  })

  it('returns deliver:false for an unknown user (fail-safe)', async () => {
    const r = await shouldDeliverPush('u_does_not_exist', 'mail')
    expect(r.deliver).toBe(false)
    expect(r.reason).toBe('user-not-found')
  })
})
