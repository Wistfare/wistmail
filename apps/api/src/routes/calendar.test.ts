import { beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  calendarEvents,
  organizations,
  orgMembers,
  sessions,
  users,
} from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import { app } from '../app.js'
import { getTestDb, resetTestDb } from '../test-support/pg-fixture.js'

/**
 * End-to-end tests for the Phase H.A calendar additions:
 *   - GET /api/v1/calendar/calendars (Phase 5 punch — AUDIT-5.3)
 *
 * Existing event CRUD is covered indirectly through the integration tests;
 * this file specifically validates the calendars-list aggregator.
 */

async function seedAuthedOrg(db: Awaited<ReturnType<typeof getTestDb>>) {
  const userId = generateId('u')
  const orgId = generateId('org')
  const sessionId = generateId('ses')
  const token = randomBytes(32).toString('hex')

  await db.insert(users).values({
    id: userId,
    email: `${userId}@cal.test`,
    name: 'Owner',
    passwordHash: 'x',
    setupComplete: true,
  })
  await db.insert(organizations).values({
    id: orgId,
    name: 'Acme',
    slug: `acme-${userId.slice(0, 6)}`,
    ownerId: userId,
  } as unknown as typeof organizations.$inferInsert)
  await db.insert(orgMembers).values({
    id: generateId('mem'),
    orgId,
    userId,
    role: 'owner',
  })
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })

  return { userId, orgId, cookie: `wm_session=${token}` }
}

async function insertEvent(
  db: Awaited<ReturnType<typeof getTestDb>>,
  userId: string,
  color: string,
) {
  const id = generateId('evt')
  const now = new Date()
  await db.insert(calendarEvents).values({
    id,
    userId,
    title: 'Test event',
    attendees: [],
    startAt: now,
    endAt: new Date(now.getTime() + 60 * 60_000),
    color,
    reminderMinutes: [15],
    createdAt: now,
    updatedAt: now,
  })
}

describe('GET /api/v1/calendar/calendars', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  it('returns 401 without a session cookie', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/calendar/calendars'),
    )
    expect(res.status).toBe(401)
  })

  it('always surfaces a Personal default for a brand-new user', async () => {
    const db = await getTestDb()
    const { cookie } = await seedAuthedOrg(db)
    const res = await app.fetch(
      new Request('http://localhost/api/v1/calendar/calendars', {
        headers: { Cookie: cookie },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { calendars: Array<{ id: string; name: string; color: string; eventCount: number }> }
    expect(body.calendars.length).toBeGreaterThanOrEqual(1)
    expect(body.calendars[0].name).toBe('Personal')
    expect(body.calendars[0].eventCount).toBe(0)
  })

  it('groups events by colour and resolves friendly names', async () => {
    const db = await getTestDb()
    const { userId, cookie } = await seedAuthedOrg(db)
    await insertEvent(db, userId, '#BFFF00')
    await insertEvent(db, userId, '#BFFF00')
    await insertEvent(db, userId, '#A78BFA')

    const res = await app.fetch(
      new Request('http://localhost/api/v1/calendar/calendars', {
        headers: { Cookie: cookie },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      calendars: Array<{ id: string; name: string; color: string; eventCount: number }>
    }
    const personal = body.calendars.find((c) => c.color === '#BFFF00')
    const work = body.calendars.find((c) => c.color === '#A78BFA')
    expect(personal?.name).toBe('Personal')
    expect(personal?.eventCount).toBe(2)
    expect(work?.name).toBe('Work')
    expect(work?.eventCount).toBe(1)
  })
})
