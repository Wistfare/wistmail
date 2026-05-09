import { describe, expect, it, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import {
  domains,
  emails,
  mailboxes,
  organizations,
  orgMembers,
  users,
  type Database,
} from '@wistmail/db'
import { getDb } from '../lib/db.js'
import { ChatService } from './chat.js'
import { FeedService } from './feed.js'

/// Integration tests for the unified inbox feed. Run against the
/// in-process PGlite fixture (DB_URL gate matches the chat.test
/// pattern). Each test seeds a small org with two users, one
/// verified domain, one mailbox, plus a handful of emails and
/// conversations so the merge / filter / cursor paths have realistic
/// input.

const DB_URL = process.env.DATABASE_URL
const describeIf = DB_URL ? describe : describe.skip

interface SeedHandles {
  db: Database
  orgId: string
  alice: { id: string; email: string; name: string; mailboxId: string }
  bob: { id: string; email: string; name: string }
  domainName: string
}

async function seedFeedFixture(): Promise<SeedHandles> {
  const db = getDb()
  const orgId = `org_${randomBytes(4).toString('hex')}`

  function mkUser(handle: string) {
    const id = `u_${handle}_${randomBytes(3).toString('hex')}`
    const email = `${handle}.${randomBytes(2).toString('hex')}@feed-test.example`
    return { id, email, name: handle.charAt(0).toUpperCase() + handle.slice(1) }
  }
  const alice = mkUser('alice')
  const bob = mkUser('bob')

  for (const u of [alice, bob]) {
    await db.insert(users).values({
      id: u.id,
      email: u.email,
      name: u.name,
      passwordHash: 'unused',
      setupComplete: true,
    })
  }

  await db.insert(organizations).values({
    id: orgId,
    name: 'Acme Feed',
    slug: `acme-${randomBytes(3).toString('hex')}`,
    ownerId: alice.id,
  })
  for (const [userId, role] of [
    [alice.id, 'owner'],
    [bob.id, 'member'],
  ] as const) {
    await db.insert(orgMembers).values({
      id: `om_${randomBytes(4).toString('hex')}`,
      orgId,
      userId,
      role,
    })
  }

  // Domain + mailbox so emails can be inserted referencing a real FK.
  const domainId = `dom_${randomBytes(4).toString('hex')}`
  const domainName = `feed-${randomBytes(4).toString('hex')}.example`
  await db.insert(domains).values({
    id: domainId,
    userId: alice.id,
    name: domainName,
    verified: true,
    dnsRecords: {},
  } as unknown as typeof domains.$inferInsert)
  const mailboxId = `mbx_${randomBytes(4).toString('hex')}`
  await db.insert(mailboxes).values({
    id: mailboxId,
    userId: alice.id,
    domainId,
    address: `alice@${domainName}`,
    displayName: 'Alice',
  })

  return {
    db,
    orgId,
    alice: { ...alice, mailboxId },
    bob,
    domainName,
  }
}

/// Build an email row for `alice`. `minutesAgo` controls activityAt
/// so tests can stage rows on a known timeline.
async function seedEmail(
  db: Database,
  alice: SeedHandles['alice'],
  opts: {
    minutesAgo: number
    subject?: string
    fromName?: string | null
    isRead?: boolean
    folder?: string
  },
): Promise<string> {
  const id = `em_${randomBytes(4).toString('hex')}`
  const at = new Date(Date.now() - opts.minutesAgo * 60_000)
  await db.insert(emails).values({
    id,
    // emails.message_id is NOT NULL — synthesize a deterministic
    // RFC-2822-ish id so the FK / uniqueness constraints stay happy.
    messageId: `<${id}@feed-test.example>`,
    mailboxId: alice.mailboxId,
    fromAddress: 'sender@example.com',
    fromName: opts.fromName ?? 'Sender',
    toAddresses: [`alice@example.com`],
    cc: [],
    bcc: [],
    subject: opts.subject ?? 'Subject',
    textBody: 'plain body',
    htmlBody: null,
    folder: opts.folder ?? 'inbox',
    isRead: opts.isRead ?? false,
    isStarred: false,
    isDraft: false,
    sizeBytes: 100,
    status: 'idle',
    sendError: null,
    threadId: null,
    snoozeUntil: null,
    scheduledAt: null,
    createdAt: at,
    updatedAt: at,
  } as unknown as typeof emails.$inferInsert)
  return id
}

/// Helper: send a chat message in a direct conv from `senderId` to
/// `recipientId`, then nudge `lastMessageAt` so the conversation has a
/// known position in the feed timeline.
async function seedDirectMessage(
  db: Database,
  chatService: ChatService,
  senderId: string,
  recipientId: string,
  opts: { content: string; minutesAgo: number },
): Promise<string> {
  const cid = await chatService.createDirect(senderId, recipientId)
  await chatService.sendMessage({
    conversationId: cid,
    senderId,
    content: opts.content,
  })
  // Override the auto-generated lastMessageAt so the test can position
  // this conversation at a precise point on the timeline. Drizzle's
  // `db.execute(sql\`...\`)` is the parameterised escape hatch; the
  // tag interpolates safely through the driver.
  const at = new Date(Date.now() - opts.minutesAgo * 60_000)
  await db.execute(
    sql`UPDATE conversations SET last_message_at = ${at} WHERE id = ${cid}`,
  )
  return cid
}

describeIf('FeedService.list — basic shape', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedFeedFixture()
  })

  it('returns an empty page when the user has no mail and no chats', async () => {
    const svc = new FeedService(h.db)
    const res = await svc.list({ userId: h.alice.id })
    expect(res.data).toEqual([])
    expect(res.nextCursor).toBeNull()
    expect(res.unreadCount).toBe(0)
  })

  it('returns email rows with the MAIL tag', async () => {
    await seedEmail(h.db, h.alice, { minutesAgo: 5, subject: 'Hello' })
    const svc = new FeedService(h.db)
    const res = await svc.list({ userId: h.alice.id })
    expect(res.data).toHaveLength(1)
    expect(res.data[0].kind).toBe('email')
    expect(res.data[0].tag).toBe('MAIL')
    if (res.data[0].kind === 'email') {
      expect(res.data[0].subject).toBe('Hello')
    }
  })

  it('returns direct chat rows with the CHAT tag', async () => {
    const chat = new ChatService(h.db)
    await seedDirectMessage(h.db, chat, h.bob.id, h.alice.id, {
      content: 'hey',
      minutesAgo: 3,
    })
    const svc = new FeedService(h.db)
    const res = await svc.list({ userId: h.alice.id })
    expect(res.data).toHaveLength(1)
    expect(res.data[0].kind).toBe('chat-direct')
    expect(res.data[0].tag).toBe('CHAT')
    if (res.data[0].kind === 'chat-direct') {
      expect(res.data[0].displayName).toBe(h.bob.name)
      expect(res.data[0].snippet).toBe('hey')
      expect(res.data[0].unreadCount).toBe(1)
      expect(res.data[0].isRead).toBe(false)
    }
  })
})

describeIf('FeedService.list — merge ordering', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedFeedFixture()
  })

  it('interleaves emails and chats by activityAt DESC', async () => {
    const chat = new ChatService(h.db)
    // Timeline (minutesAgo): 10=email-old, 5=chat, 1=email-new
    await seedEmail(h.db, h.alice, { minutesAgo: 10, subject: 'old mail' })
    await seedDirectMessage(h.db, chat, h.bob.id, h.alice.id, {
      content: 'middle chat',
      minutesAgo: 5,
    })
    await seedEmail(h.db, h.alice, { minutesAgo: 1, subject: 'new mail' })

    const svc = new FeedService(h.db)
    const res = await svc.list({ userId: h.alice.id })
    expect(res.data).toHaveLength(3)
    // Newest first: new mail → chat → old mail.
    const subjects = res.data.map((d) => {
      if (d.kind === 'email') return d.subject
      if (d.kind === 'chat-direct') return d.snippet
      return d.title
    })
    expect(subjects).toEqual(['new mail', 'middle chat', 'old mail'])
  })

  it('leaves chats out when folder !== "inbox"', async () => {
    const chat = new ChatService(h.db)
    await seedDirectMessage(h.db, chat, h.bob.id, h.alice.id, {
      content: 'hi',
      minutesAgo: 1,
    })
    await seedEmail(h.db, h.alice, { minutesAgo: 2, folder: 'sent' })

    const svc = new FeedService(h.db)
    const res = await svc.list({ userId: h.alice.id, folder: 'sent' })
    expect(res.data).toHaveLength(1)
    expect(res.data[0].kind).toBe('email')
  })
})

describeIf('FeedService.list — kind filter', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedFeedFixture()
  })

  it('kind=mail returns only emails', async () => {
    const chat = new ChatService(h.db)
    await seedEmail(h.db, h.alice, { minutesAgo: 3 })
    await seedDirectMessage(h.db, chat, h.bob.id, h.alice.id, {
      content: 'ignore me',
      minutesAgo: 1,
    })
    const svc = new FeedService(h.db)
    const res = await svc.list({ userId: h.alice.id, kind: 'mail' })
    expect(res.data).toHaveLength(1)
    expect(res.data[0].kind).toBe('email')
  })

  it('kind=chats returns only conversations', async () => {
    const chat = new ChatService(h.db)
    await seedEmail(h.db, h.alice, { minutesAgo: 3 })
    await seedDirectMessage(h.db, chat, h.bob.id, h.alice.id, {
      content: 'hi',
      minutesAgo: 1,
    })
    const svc = new FeedService(h.db)
    const res = await svc.list({ userId: h.alice.id, kind: 'chats' })
    expect(res.data).toHaveLength(1)
    expect(res.data[0].kind).toBe('chat-direct')
  })
})

describeIf('FeedService.list — cursor pagination', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedFeedFixture()
  })

  it('returns nextCursor when more items remain', async () => {
    for (let i = 0; i < 5; i++) {
      await seedEmail(h.db, h.alice, {
        minutesAgo: i + 1,
        subject: `mail-${i}`,
      })
    }
    const svc = new FeedService(h.db)
    const page1 = await svc.list({ userId: h.alice.id, limit: 2 })
    expect(page1.data).toHaveLength(2)
    expect(page1.nextCursor).not.toBeNull()
    if (page1.data[0].kind === 'email') {
      expect(page1.data[0].subject).toBe('mail-0') // newest
    }

    const page2 = await svc.list({
      userId: h.alice.id,
      limit: 2,
      cursor: page1.nextCursor,
    })
    expect(page2.data).toHaveLength(2)
    if (page2.data[0].kind === 'email') {
      expect(page2.data[0].subject).toBe('mail-2')
    }

    const page3 = await svc.list({
      userId: h.alice.id,
      limit: 2,
      cursor: page2.nextCursor,
    })
    expect(page3.data).toHaveLength(1) // last row only
    expect(page3.nextCursor).toBeNull()
  })
})

describeIf('FeedService.list — unread count', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedFeedFixture()
  })

  it('counts unread mail and unread chat conversations', async () => {
    const chat = new ChatService(h.db)
    await seedEmail(h.db, h.alice, { minutesAgo: 5, isRead: false })
    await seedEmail(h.db, h.alice, { minutesAgo: 4, isRead: false })
    await seedEmail(h.db, h.alice, { minutesAgo: 3, isRead: true })
    await seedDirectMessage(h.db, chat, h.bob.id, h.alice.id, {
      content: 'unread chat',
      minutesAgo: 2,
    })

    const svc = new FeedService(h.db)
    const all = await svc.list({ userId: h.alice.id, kind: 'all' })
    expect(all.unreadCount).toBe(3) // 2 mail + 1 conv

    const mail = await svc.list({ userId: h.alice.id, kind: 'mail' })
    expect(mail.unreadCount).toBe(2)

    const chats = await svc.list({ userId: h.alice.id, kind: 'chats' })
    expect(chats.unreadCount).toBe(1)
  })

  it('counts shrink as the user reads things', async () => {
    const chat = new ChatService(h.db)
    const cid = await seedDirectMessage(h.db, chat, h.bob.id, h.alice.id, {
      content: 'mark me',
      minutesAgo: 1,
    })

    const svc = new FeedService(h.db)
    const before = await svc.list({ userId: h.alice.id, kind: 'chats' })
    expect(before.unreadCount).toBe(1)

    await chat.markRead(cid, h.alice.id)
    const after = await svc.list({ userId: h.alice.id, kind: 'chats' })
    expect(after.unreadCount).toBe(0)
  })
})
