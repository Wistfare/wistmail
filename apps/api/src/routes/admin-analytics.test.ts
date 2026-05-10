/**
 * End-to-end tests for the Phase F admin endpoints:
 *   - GET /api/v1/admin/overview-stats
 *   - GET /api/v1/admin/analytics
 *   - GET /api/v1/admin/domains
 *
 * Drive the real Hono app via `app.fetch` with a session cookie minted
 * directly into the sessions table — same pattern as billing.test.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  domains,
  emails,
  mailboxes,
  organizations,
  orgMembers,
  sendingLogs,
  sessions,
  users,
} from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import { app } from '../app.js'
import { getTestDb, resetTestDb } from '../test-support/pg-fixture.js'

async function seedAuthedOrg(db: Awaited<ReturnType<typeof getTestDb>>) {
  const userId = generateId('u')
  const orgId = generateId('org')
  const sessionId = generateId('ses')
  const token = randomBytes(32).toString('hex')

  await db.insert(users).values({
    id: userId,
    email: `${userId}@admin.test`,
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

async function seedMailboxAndEmail(
  db: Awaited<ReturnType<typeof getTestDb>>,
  userId: string,
  options: {
    domainName?: string
    domainVerified?: boolean
    folder?: string
    subjectPrefix?: string
    sizeBytes?: number
    daysAgo?: number
    fromAddress?: string
  } = {},
) {
  const domainName = options.domainName ?? 'wistmail.example'
  const domainId = generateId('dom')
  const mailboxId = generateId('mbx')
  const emailId = generateId('em')
  const fromAddress = options.fromAddress ?? `owner@${domainName}`

  // Insert domain (idempotent-ish — caller is responsible for dedup).
  await db.insert(domains).values({
    id: domainId,
    name: domainName,
    userId,
    verified: options.domainVerified ?? true,
    status: options.domainVerified ?? true ? 'verified' : 'pending',
  } as unknown as typeof domains.$inferInsert)

  await db.insert(mailboxes).values({
    id: mailboxId,
    address: fromAddress,
    displayName: 'Owner',
    domainId,
    userId,
  } as unknown as typeof mailboxes.$inferInsert)

  const createdAt = options.daysAgo
    ? new Date(Date.now() - options.daysAgo * 86400_000)
    : new Date()
  await db.insert(emails).values({
    id: emailId,
    messageId: `<${emailId}@local.test>`,
    fromAddress,
    folder: options.folder ?? 'sent',
    subject: `${options.subjectPrefix ?? 'msg'}-${emailId}`,
    mailboxId,
    sizeBytes: options.sizeBytes ?? 1024,
    createdAt,
    updatedAt: createdAt,
  } as unknown as typeof emails.$inferInsert)

  return { domainId, mailboxId, emailId }
}

describe('admin analytics routes', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  describe('auth', () => {
    it('GET /overview-stats requires a session cookie', async () => {
      const res = await app.fetch(new Request('http://localhost/api/v1/admin/overview-stats'))
      expect(res.status).toBe(401)
    })

    it('GET /analytics requires a session cookie', async () => {
      const res = await app.fetch(new Request('http://localhost/api/v1/admin/analytics'))
      expect(res.status).toBe(401)
    })

    it('GET /domains requires a session cookie', async () => {
      const res = await app.fetch(new Request('http://localhost/api/v1/admin/domains'))
      expect(res.status).toBe(401)
    })
  })

  describe('GET /overview-stats', () => {
    it('returns the empty-state shape for an org with no mailboxes', async () => {
      const db = await getTestDb()
      const { cookie } = await seedAuthedOrg(db)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/admin/overview-stats?range=7d', {
          headers: { Cookie: cookie },
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: any }
      expect(body.data.users).toBe(1)
      expect(body.data.storageBytes).toBe(0)
      expect(body.data.messagesSent).toBe(0)
      expect(body.data.totalDomains).toBe(0)
      expect(body.data.verifiedDomains).toBe(0)
      // dailySent always returns rangeDays buckets, even when empty.
      expect(body.data.dailySent).toHaveLength(7)
      expect(body.data.topSenders).toEqual([])
    })

    it('counts sent messages and storage for the org', async () => {
      const db = await getTestDb()
      const { userId, cookie } = await seedAuthedOrg(db)
      await seedMailboxAndEmail(db, userId, { folder: 'sent', sizeBytes: 4096 })
      await seedMailboxAndEmail(db, userId, {
        folder: 'sent',
        sizeBytes: 2048,
        domainName: 'wistmail2.example',
      })

      const res = await app.fetch(
        new Request('http://localhost/api/v1/admin/overview-stats', {
          headers: { Cookie: cookie },
        }),
      )
      const body = (await res.json()) as { data: any }
      expect(body.data.messagesSent).toBe(2)
      expect(body.data.storageBytes).toBe(6144)
      expect(body.data.totalDomains).toBe(2)
      expect(body.data.verifiedDomains).toBe(2)
      expect(body.data.dailySent).toHaveLength(7)
    })

    it('clamps range parameter to a sane default for malformed input', async () => {
      const db = await getTestDb()
      const { cookie } = await seedAuthedOrg(db)
      const res = await app.fetch(
        new Request('http://localhost/api/v1/admin/overview-stats?range=garbage', {
          headers: { Cookie: cookie },
        }),
      )
      const body = (await res.json()) as { data: any }
      expect(body.data.dailySent).toHaveLength(7) // fallback = 7
    })
  })

  describe('GET /analytics', () => {
    it('returns zero KPIs when no sending_logs exist', async () => {
      const db = await getTestDb()
      const { cookie } = await seedAuthedOrg(db)

      const res = await app.fetch(
        new Request('http://localhost/api/v1/admin/analytics?range=30d', {
          headers: { Cookie: cookie },
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: any }
      expect(body.data.kpis.sent).toBe(0)
      expect(body.data.kpis.deliveredPct).toBe(0)
      expect(body.data.dailySent).toHaveLength(30)
      expect(body.data.rangeDays).toBe(30)
    })

    it('aggregates sending_logs into KPIs', async () => {
      const db = await getTestDb()
      const { userId, cookie } = await seedAuthedOrg(db)
      const { emailId: e1 } = await seedMailboxAndEmail(db, userId, { folder: 'sent' })
      const { emailId: e2 } = await seedMailboxAndEmail(db, userId, {
        folder: 'sent',
        domainName: 'd2.example',
      })

      const now = new Date()
      const twoMin = new Date(now.getTime() + 2 * 60_000)
      await db.insert(sendingLogs).values([
        {
          id: generateId('sl'),
          emailId: e1,
          status: 'delivered',
          deliveredAt: twoMin,
          openedAt: twoMin,
          createdAt: now,
        } as unknown as typeof sendingLogs.$inferInsert,
        {
          id: generateId('sl'),
          emailId: e2,
          status: 'bounced',
          bouncedAt: twoMin,
          createdAt: now,
        } as unknown as typeof sendingLogs.$inferInsert,
      ])

      const res = await app.fetch(
        new Request('http://localhost/api/v1/admin/analytics', {
          headers: { Cookie: cookie },
        }),
      )
      const body = (await res.json()) as { data: any }
      expect(body.data.kpis.sent).toBe(2)
      expect(body.data.kpis.delivered).toBe(1)
      expect(body.data.kpis.deliveredPct).toBe(50)
      expect(body.data.kpis.bounced).toBe(1)
      expect(body.data.kpis.bouncePct).toBe(50)
      expect(body.data.kpis.opened).toBe(1)
      expect(body.data.kpis.openPct).toBe(50)
    })
  })

  describe('GET /domains', () => {
    it('returns empty list when org has no domains', async () => {
      const db = await getTestDb()
      const { cookie } = await seedAuthedOrg(db)
      const res = await app.fetch(
        new Request('http://localhost/api/v1/admin/domains', {
          headers: { Cookie: cookie },
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { data: any[] }
      expect(body.data).toEqual([])
    })

    it('joins recent message count to each domain', async () => {
      const db = await getTestDb()
      const { userId, cookie } = await seedAuthedOrg(db)
      await seedMailboxAndEmail(db, userId, {
        domainName: 'busy.example',
        folder: 'sent',
        fromAddress: 'send@busy.example',
      })
      await seedMailboxAndEmail(db, userId, {
        domainName: 'quiet.example',
        domainVerified: false,
        folder: 'sent',
        fromAddress: 'send@quiet.example',
      })

      const res = await app.fetch(
        new Request('http://localhost/api/v1/admin/domains', {
          headers: { Cookie: cookie },
        }),
      )
      const body = (await res.json()) as { data: any[] }
      expect(body.data).toHaveLength(2)
      const busy = body.data.find((d) => d.name === 'busy.example')
      const quiet = body.data.find((d) => d.name === 'quiet.example')
      expect(busy?.messages30d).toBe(1)
      expect(quiet?.messages30d).toBe(1)
      expect(busy?.verified).toBe(true)
      expect(quiet?.verified).toBe(false)
    })
  })
})
