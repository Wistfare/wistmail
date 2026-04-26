/// Integration tests for the bearer-token notification action routes.
/// Hits `app.request` directly so the route file's wiring + token
/// verification is exercised end-to-end.

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
  chatMessages,
  conversationParticipants,
  conversations,
  domains,
  emails,
  mailboxes,
  organizations,
  orgMembers,
  users,
} from '@wistmail/db'
import { app } from '../app.js'
import { getDb } from '../lib/db.js'
import { issueNotificationToken } from '../services/notification-tokens.js'

const ORIGINAL_JWT = process.env.JWT_SECRET
beforeEach(() => {
  process.env.JWT_SECRET = 'integration-test-secret'
})
afterEach(() => {
  if (ORIGINAL_JWT !== undefined) process.env.JWT_SECRET = ORIGINAL_JWT
  else delete process.env.JWT_SECRET
})

const DB_URL = process.env.DATABASE_URL
const describeIf = DB_URL ? describe : describe.skip

interface EmailFixture {
  userId: string
  mailboxId: string
  emailId: string
}

async function seedEmail(): Promise<EmailFixture> {
  const db = getDb()
  const userId = `u_qr_${randomBytes(3).toString('hex')}`
  const domainId = `dom_qr_${randomBytes(3).toString('hex')}`
  const mailboxId = `mbx_qr_${randomBytes(3).toString('hex')}`
  const domainName = `qr-${randomBytes(3).toString('hex')}.example`
  await db.insert(users).values({
    id: userId,
    email: `qr.${randomBytes(2).toString('hex')}@${domainName}`,
    name: 'Quick',
    passwordHash: 'unused',
    setupComplete: true,
  })
  await db.insert(domains).values({
    id: domainId,
    userId,
    name: domainName,
    verified: true,
    dnsRecords: {},
  } as unknown as typeof domains.$inferInsert)
  await db.insert(mailboxes).values({
    id: mailboxId,
    userId,
    domainId,
    address: `inbox@${domainName}`,
    displayName: 'Inbox',
  })
  const emailId = `eml_${randomBytes(3).toString('hex')}`
  await db.insert(emails).values({
    id: emailId,
    messageId: `msg-${randomBytes(4).toString('hex')}`,
    mailboxId,
    fromAddress: 'sender@example.com',
    toAddresses: [`inbox@${domainName}`],
    cc: [],
    bcc: [],
    subject: 'Hello',
    textBody: 'hi',
    folder: 'inbox',
    isRead: false,
  } as unknown as typeof emails.$inferInsert)
  return { userId, mailboxId, emailId }
}

interface ChatFixture {
  alice: string
  bob: string
  conversationId: string
}

async function seedChat(): Promise<ChatFixture> {
  const db = getDb()
  const alice = `u_alice_${randomBytes(3).toString('hex')}`
  const bob = `u_bob_${randomBytes(3).toString('hex')}`
  const orgId = `org_${randomBytes(3).toString('hex')}`
  for (const [id, name] of [
    [alice, 'Alice'],
    [bob, 'Bob'],
  ] as const) {
    await db.insert(users).values({
      id,
      email: `${name.toLowerCase()}.${randomBytes(2).toString('hex')}@chat-qr.example`,
      name,
      passwordHash: 'unused',
      setupComplete: true,
    })
  }
  await db.insert(organizations).values({
    id: orgId,
    name: 'Org',
    slug: `org-${randomBytes(3).toString('hex')}`,
    ownerId: alice,
  })
  for (const userId of [alice, bob]) {
    await db.insert(orgMembers).values({
      id: `om_${randomBytes(3).toString('hex')}`,
      orgId,
      userId,
      role: userId === alice ? 'owner' : 'member',
    })
  }
  const conversationId = `cnv_${randomBytes(3).toString('hex')}`
  await db.insert(conversations).values({
    id: conversationId,
    kind: 'direct',
    createdBy: alice,
  })
  await db.insert(conversationParticipants).values([
    { conversationId, userId: alice },
    { conversationId, userId: bob },
  ])
  return { alice, bob, conversationId }
}

// ── /emails/:id/quick-read ───────────────────────────────────────────

describeIf('POST /api/v1/notify/emails/:id/quick-read', () => {
  it('marks the email read with a valid token', async () => {
    const f = await seedEmail()
    const tok = issueNotificationToken({
      userId: f.userId,
      resourceType: 'email',
      resourceId: f.emailId,
      scope: 'read',
    })
    const res = await app.request(
      `/api/v1/notify/emails/${f.emailId}/quick-read`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tok.token}` },
      },
    )
    expect(res.status).toBe(200)
    const row = await getDb()
      .select({ isRead: emails.isRead })
      .from(emails)
      .where(eq(emails.id, f.emailId))
    expect(row[0].isRead).toBe(true)
  })

  it('rejects a missing Authorization header with 401', async () => {
    const res = await app.request(
      `/api/v1/notify/emails/some-id/quick-read`,
      { method: 'POST' },
    )
    expect(res.status).toBe(401)
  })

  it('rejects a token issued for a different email with 403', async () => {
    const f = await seedEmail()
    const tok = issueNotificationToken({
      userId: f.userId,
      resourceType: 'email',
      resourceId: 'eml_other',
      scope: 'read',
    })
    const res = await app.request(
      `/api/v1/notify/emails/${f.emailId}/quick-read`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tok.token}` },
      },
    )
    expect(res.status).toBe(403)
  })

  it('rejects a token issued for a different scope with 403', async () => {
    const f = await seedEmail()
    const tok = issueNotificationToken({
      userId: f.userId,
      resourceType: 'email',
      resourceId: f.emailId,
      scope: 'reply',
    })
    const res = await app.request(
      `/api/v1/notify/emails/${f.emailId}/quick-read`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tok.token}` },
      },
    )
    expect(res.status).toBe(403)
  })
})

// ── /chat/conversations/:id/quick-reply ──────────────────────────────

describeIf('POST /api/v1/notify/chat/conversations/:id/quick-reply', () => {
  it('posts a chat message with a valid token', async () => {
    const f = await seedChat()
    const tok = issueNotificationToken({
      userId: f.alice,
      resourceType: 'chat',
      resourceId: f.conversationId,
      scope: 'reply',
    })
    const res = await app.request(
      `/api/v1/notify/chat/conversations/${f.conversationId}/quick-reply`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${tok.token}`,
        },
        body: JSON.stringify({ content: 'replied from notification' }),
      },
    )
    expect(res.status).toBe(201)
    const rows = await getDb()
      .select({ content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, f.conversationId))
    expect(rows.map((r) => r.content)).toContain('replied from notification')
  })

  it('rejects an empty content body with 400', async () => {
    const f = await seedChat()
    const tok = issueNotificationToken({
      userId: f.alice,
      resourceType: 'chat',
      resourceId: f.conversationId,
      scope: 'reply',
    })
    const res = await app.request(
      `/api/v1/notify/chat/conversations/${f.conversationId}/quick-reply`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${tok.token}`,
        },
        body: JSON.stringify({ content: '' }),
      },
    )
    expect(res.status).toBe(400)
  })

  it('rejects when the token user is not a conversation participant with 403', async () => {
    const f = await seedChat()
    // Create a third user (not a participant) and issue them a token
    // for this conversation. The token verification passes (the
    // token IS for this conversation) but the chat service refuses
    // because they're not a member.
    const outsider = `u_outsider_${randomBytes(3).toString('hex')}`
    await getDb().insert(users).values({
      id: outsider,
      email: `out.${randomBytes(2).toString('hex')}@chat-qr.example`,
      name: 'Out',
      passwordHash: 'unused',
      setupComplete: true,
    })
    const tok = issueNotificationToken({
      userId: outsider,
      resourceType: 'chat',
      resourceId: f.conversationId,
      scope: 'reply',
    })
    const res = await app.request(
      `/api/v1/notify/chat/conversations/${f.conversationId}/quick-reply`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${tok.token}`,
        },
        body: JSON.stringify({ content: 'leaking' }),
      },
    )
    expect(res.status).toBe(403)
  })
})

// ── /chat/conversations/:id/quick-read ───────────────────────────────

describeIf('POST /api/v1/notify/chat/conversations/:id/quick-read', () => {
  it('clears the unread count for the token user', async () => {
    const f = await seedChat()
    // Bob receives a message → his unread count is bumped.
    await getDb().insert(chatMessages).values({
      id: `msg_${randomBytes(3).toString('hex')}`,
      conversationId: f.conversationId,
      senderId: f.alice,
      content: 'hi bob',
    } as unknown as typeof chatMessages.$inferInsert)
    await getDb()
      .update(conversationParticipants)
      .set({ unreadCount: 1 })
      .where(eq(conversationParticipants.userId, f.bob))

    const tok = issueNotificationToken({
      userId: f.bob,
      resourceType: 'chat',
      resourceId: f.conversationId,
      scope: 'read',
    })
    const res = await app.request(
      `/api/v1/notify/chat/conversations/${f.conversationId}/quick-read`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${tok.token}` },
      },
    )
    expect(res.status).toBe(200)
    const rows = await getDb()
      .select({ unreadCount: conversationParticipants.unreadCount })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, f.bob))
    expect(rows[0].unreadCount).toBe(0)
  })
})
