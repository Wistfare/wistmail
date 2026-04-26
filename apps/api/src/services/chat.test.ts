import { describe, expect, it, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  organizations,
  orgMembers,
  users,
  type Database,
} from '@wistmail/db'
import { getDb } from '../lib/db.js'
import { ChatService } from './chat.js'

/// Chat service integration tests. Run against the in-process PGlite
/// fixture set up in `test-support/setup.ts`. The fixture seeds one
/// "test" user already; we layer in a small org with multiple
/// members so the multi-participant flows have realistic state.

const DB_URL = process.env.DATABASE_URL
const describeIf = DB_URL ? describe : describe.skip

interface SeedHandles {
  db: Database
  orgId: string
  alice: { id: string; email: string; name: string }
  bob: { id: string; email: string; name: string }
  carol: { id: string; email: string; name: string }
  outsider: { id: string; email: string; name: string }
}

async function seedChatFixture(): Promise<SeedHandles> {
  const db = getDb()
  const orgId = `org_${randomBytes(4).toString('hex')}`
  const altOrgId = `org_${randomBytes(4).toString('hex')}`

  function mkUser(handle: string) {
    const id = `u_${handle}_${randomBytes(3).toString('hex')}`
    const email = `${handle}.${randomBytes(2).toString('hex')}@chat-test.example`
    return { id, email, name: handle.charAt(0).toUpperCase() + handle.slice(1) }
  }

  const alice = mkUser('alice')
  const bob = mkUser('bob')
  const carol = mkUser('carol')
  const outsider = mkUser('zach')

  for (const u of [alice, bob, carol, outsider]) {
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
    name: 'Acme Chat',
    slug: `acme-${randomBytes(3).toString('hex')}`,
    ownerId: alice.id,
  })
  await db.insert(organizations).values({
    id: altOrgId,
    name: 'Outsider Co',
    slug: `outco-${randomBytes(3).toString('hex')}`,
    ownerId: outsider.id,
  })

  for (const [userId, role, oid] of [
    [alice.id, 'owner', orgId],
    [bob.id, 'member', orgId],
    [carol.id, 'member', orgId],
    [outsider.id, 'owner', altOrgId],
  ] as const) {
    await db.insert(orgMembers).values({
      id: `om_${randomBytes(4).toString('hex')}`,
      orgId: oid,
      userId,
      role,
    })
  }

  return { db, orgId, alice, bob, carol, outsider }
}

describeIf('ChatService.createDirect', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('creates a new direct conversation with two participants', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createDirect(h.alice.id, h.bob.id)
    expect(id).toMatch(/^cnv_/)

    const list = await svc.listForUser(h.alice.id)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(id)
    expect(list[0].kind).toBe('direct')
    expect(list[0].otherParticipants).toHaveLength(1)
    expect(list[0].otherParticipants[0].email).toBe(h.bob.email)
  })

  it('is idempotent — second call between the same pair returns the existing conversation', async () => {
    const svc = new ChatService(h.db)
    const first = await svc.createDirect(h.alice.id, h.bob.id)
    const second = await svc.createDirect(h.alice.id, h.bob.id)
    expect(second).toBe(first)
    // Order independence — A→B and B→A resolve to the same conv.
    const reversed = await svc.createDirect(h.bob.id, h.alice.id)
    expect(reversed).toBe(first)
  })

  it('refuses to create a direct conversation with self', async () => {
    const svc = new ChatService(h.db)
    await expect(svc.createDirect(h.alice.id, h.alice.id)).rejects.toThrow(
      /yourself/i,
    )
  })
})

describeIf('ChatService.sendMessage / markRead unread bookkeeping', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('increments unreadCount for the recipient and not the sender', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'hello bob',
    })

    const aliceList = await svc.listForUser(h.alice.id)
    const bobList = await svc.listForUser(h.bob.id)
    expect(aliceList[0].unreadCount).toBe(0)
    expect(bobList[0].unreadCount).toBe(1)
    expect(bobList[0].lastMessage?.content).toBe('hello bob')
  })

  it('multiple messages keep stacking the unread count', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    for (const c of ['1', '2', '3']) {
      await svc.sendMessage({
        conversationId: cid,
        senderId: h.alice.id,
        content: c,
      })
    }
    const bobList = await svc.listForUser(h.bob.id)
    expect(bobList[0].unreadCount).toBe(3)
  })

  it('markRead clears the unread count for that user only', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'ping',
    })

    await svc.markRead(cid, h.bob.id)
    const bobList = await svc.listForUser(h.bob.id)
    expect(bobList[0].unreadCount).toBe(0)
  })

  it('rejects sendMessage from a non-participant', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    await expect(
      svc.sendMessage({
        conversationId: cid,
        senderId: h.carol.id,
        content: 'eavesdropping',
      }),
    ).rejects.toThrow(/Not a participant/)
  })

  it('rejects listMessages for a non-participant', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'private',
    })
    await expect(svc.listMessages(cid, h.carol.id)).rejects.toThrow(
      /Not a participant/,
    )
  })

  it('listMessages returns messages oldest-first', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'first',
    })
    // Tiny gap so the second message gets a strictly-later
    // `created_at` — `listMessages` orders on the timestamp and the
    // PGlite resolution is millisecond, same as production.
    await new Promise((r) => setTimeout(r, 5))
    await svc.sendMessage({
      conversationId: cid,
      senderId: h.bob.id,
      content: 'second',
    })
    const msgs = await svc.listMessages(cid, h.alice.id)
    expect(msgs.map((m) => m.content)).toEqual(['first', 'second'])
  })
})

describeIf('ChatService.listParticipantsWithUnread', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('returns one row per participant with their current unread count', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'hi',
    })

    const rows = await svc.listParticipantsWithUnread(cid)
    expect(rows).toHaveLength(2)
    const byUser = new Map(rows.map((r) => [r.userId, r.unreadCount]))
    expect(byUser.get(h.alice.id)).toBe(0)
    expect(byUser.get(h.bob.id)).toBe(1)
  })
})

describeIf('ChatService.createGroup', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('creates a group and adds the creator + named participants', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'Engineering',
      participantIds: [h.bob.id, h.carol.id],
    })
    expect(id).toMatch(/^cnv_/)

    const aliceList = await svc.listForUser(h.alice.id)
    expect(aliceList).toHaveLength(1)
    expect(aliceList[0].kind).toBe('group')
    expect(aliceList[0].title).toBe('Engineering')
    expect(aliceList[0].otherParticipants).toHaveLength(2)

    const bobList = await svc.listForUser(h.bob.id)
    expect(bobList).toHaveLength(1)
    expect(bobList[0].id).toBe(id)
  })

  it('rejects an empty title', async () => {
    const svc = new ChatService(h.db)
    await expect(
      svc.createGroup({
        creatorId: h.alice.id,
        title: '   ',
        participantIds: [h.bob.id],
      }),
    ).rejects.toThrow(/title is required/i)
  })

  it('rejects a group with no other participants', async () => {
    const svc = new ChatService(h.db)
    await expect(
      svc.createGroup({
        creatorId: h.alice.id,
        title: 'Just me',
        participantIds: [h.alice.id], // only the creator
      }),
    ).rejects.toThrow(/at least one other participant/i)
  })

  it('dedupes duplicate participantIds', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'Squad',
      participantIds: [h.bob.id, h.bob.id, h.carol.id],
    })
    const members = await svc.listParticipants(id, h.alice.id)
    expect(members).toHaveLength(3) // alice + bob + carol
  })
})

describeIf('ChatService.addParticipants / removeParticipant', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('adds new members and skips already-present ones', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'Group',
      participantIds: [h.bob.id],
    })

    const result = await svc.addParticipants(id, h.alice.id, [
      h.carol.id,
      h.bob.id, // already in
    ])
    expect(result.added).toEqual([h.carol.id])

    const members = await svc.listParticipants(id, h.alice.id)
    expect(members.map((m) => m.id).sort()).toEqual(
      [h.alice.id, h.bob.id, h.carol.id].sort(),
    )
  })

  it('rejects addParticipants on a direct conversation', async () => {
    const svc = new ChatService(h.db)
    const direct = await svc.createDirect(h.alice.id, h.bob.id)
    await expect(
      svc.addParticipants(direct, h.alice.id, [h.carol.id]),
    ).rejects.toThrow(/non-group/i)
  })

  it('rejects addParticipants from a non-member', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'Group',
      participantIds: [h.bob.id],
    })
    await expect(
      svc.addParticipants(id, h.carol.id, [h.outsider.id]),
    ).rejects.toThrow(/Not a participant/)
  })

  it('allows self-leave by any member', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'Group',
      participantIds: [h.bob.id, h.carol.id],
    })

    await svc.removeParticipant(id, h.bob.id, h.bob.id)
    const members = await svc.listParticipants(id, h.alice.id)
    expect(members.map((m) => m.id)).not.toContain(h.bob.id)

    // Bob can no longer access the conversation.
    const bobList = await svc.listForUser(h.bob.id)
    expect(bobList).toHaveLength(0)
  })

  it('lets the creator remove other members', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'Group',
      participantIds: [h.bob.id, h.carol.id],
    })
    await svc.removeParticipant(id, h.alice.id, h.bob.id)
    const members = await svc.listParticipants(id, h.alice.id)
    expect(members.map((m) => m.id)).not.toContain(h.bob.id)
  })

  it('refuses non-creator removing another member', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'Group',
      participantIds: [h.bob.id, h.carol.id],
    })
    await expect(
      svc.removeParticipant(id, h.bob.id, h.carol.id),
    ).rejects.toThrow(/Only the group creator/)
  })
})

describeIf('ChatService.listParticipants', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('returns full member shape for a group', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'Group',
      participantIds: [h.bob.id],
    })
    const members = await svc.listParticipants(id, h.alice.id)
    expect(members).toHaveLength(2)
    const bob = members.find((m) => m.id === h.bob.id)
    expect(bob?.email).toBe(h.bob.email)
    expect(bob?.name).toBe(h.bob.name)
  })

  it('refuses non-members', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'Group',
      participantIds: [h.bob.id],
    })
    await expect(svc.listParticipants(id, h.carol.id)).rejects.toThrow(
      /Not a participant/,
    )
  })
})

describeIf('ChatService.editMessage', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('lets the sender edit their own message and stamps editedAt', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'oroginal',
    })
    const result = await svc.editMessage({
      conversationId: cid,
      messageId: sent.id,
      userId: h.alice.id,
      content: 'original',
    })
    expect(result.content).toBe('original')
    expect(result.editedAt).toBeInstanceOf(Date)

    const msgs = await svc.listMessages(cid, h.alice.id)
    expect(msgs[0].content).toBe('original')
    expect(msgs[0].editedAt).not.toBeNull()
  })

  it('refuses edits from a non-sender', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'hi',
    })
    await expect(
      svc.editMessage({
        conversationId: cid,
        messageId: sent.id,
        userId: h.bob.id,
        content: 'tampered',
      }),
    ).rejects.toThrow(/Only the sender/)
  })

  it('rejects an empty edit', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'hi',
    })
    await expect(
      svc.editMessage({
        conversationId: cid,
        messageId: sent.id,
        userId: h.alice.id,
        content: '   ',
      }),
    ).rejects.toThrow(/content is required/i)
  })

  it('refuses edits on a deleted message', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'hi',
    })
    await svc.deleteMessage({
      conversationId: cid,
      messageId: sent.id,
      userId: h.alice.id,
    })
    await expect(
      svc.editMessage({
        conversationId: cid,
        messageId: sent.id,
        userId: h.alice.id,
        content: 'never',
      }),
    ).rejects.toThrow(/deleted/i)
  })
})

describeIf('ChatService.deleteMessage', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('soft-deletes by the sender; content is blanked in subsequent reads', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'secret',
    })
    await svc.deleteMessage({
      conversationId: cid,
      messageId: sent.id,
      userId: h.alice.id,
    })

    const msgs = await svc.listMessages(cid, h.alice.id)
    expect(msgs[0].id).toBe(sent.id)
    expect(msgs[0].content).toBe('')
    expect(msgs[0].deletedAt).not.toBeNull()
  })

  it('refuses deletion from a non-sender', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'hi',
    })
    await expect(
      svc.deleteMessage({
        conversationId: cid,
        messageId: sent.id,
        userId: h.bob.id,
      }),
    ).rejects.toThrow(/Only the sender/)
  })

  it('is idempotent when called twice', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'hi',
    })
    const first = await svc.deleteMessage({
      conversationId: cid,
      messageId: sent.id,
      userId: h.alice.id,
    })
    const second = await svc.deleteMessage({
      conversationId: cid,
      messageId: sent.id,
      userId: h.alice.id,
    })
    expect(second.deletedAt.getTime()).toBe(first.deletedAt.getTime())
  })

  it('falls back to the previous message in the conversation list preview', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'first',
    })
    await new Promise((r) => setTimeout(r, 5))
    const second = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'second',
    })
    await svc.deleteMessage({
      conversationId: cid,
      messageId: second.id,
      userId: h.alice.id,
    })

    const list = await svc.listForUser(h.bob.id)
    expect(list[0].lastMessage?.content).toBe('first')
  })
})

describeIf('ChatService per-message read receipts', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('markRead writes a receipt row for unseen incoming messages only', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    const m1 = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'one',
    })
    await new Promise((r) => setTimeout(r, 5))
    const m2 = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'two',
    })

    await svc.markRead(cid, h.bob.id)

    const reads = await svc.listConversationReads(cid, h.bob.id)
    const ids = reads.map((r) => r.messageId).sort()
    expect(ids).toEqual([m1.id, m2.id].sort())
    // No receipts are written for the sender's own messages.
    expect(reads.every((r) => r.userId === h.bob.id)).toBe(true)
  })

  it('does not duplicate receipts when markRead runs twice', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'hi',
    })

    await svc.markRead(cid, h.bob.id)
    await svc.markRead(cid, h.bob.id) // second call should be a no-op

    const reads = await svc.listConversationReads(cid, h.bob.id)
    expect(reads).toHaveLength(1)
  })

  it('listMessageReads returns participants who have seen a specific message', async () => {
    const svc = new ChatService(h.db)
    const id = await svc.createGroup({
      creatorId: h.alice.id,
      title: 'team',
      participantIds: [h.bob.id, h.carol.id],
    })
    const sent = await svc.sendMessage({
      conversationId: id,
      senderId: h.alice.id,
      content: 'hello team',
    })

    await svc.markRead(id, h.bob.id)
    await svc.markRead(id, h.carol.id)

    const readers = await svc.listMessageReads({
      conversationId: id,
      messageId: sent.id,
      requesterId: h.alice.id,
    })
    const ids = readers.map((r) => r.userId).sort()
    expect(ids).toEqual([h.bob.id, h.carol.id].sort())
  })

  it('rejects listMessageReads for a non-participant', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'private',
    })
    await expect(
      svc.listMessageReads({
        conversationId: cid,
        messageId: sent.id,
        requesterId: h.carol.id,
      }),
    ).rejects.toThrow(/Not a participant/)
  })

  it('rejects edit when conversationId in URL does not match the message', async () => {
    const svc = new ChatService(h.db)
    const cidA = await svc.createDirect(h.alice.id, h.bob.id)
    const cidB = await svc.createDirect(h.alice.id, h.carol.id)
    const sent = await svc.sendMessage({
      conversationId: cidA,
      senderId: h.alice.id,
      content: 'in A',
    })
    // Try to edit the A-message via the B URL — should look like 404.
    await expect(
      svc.editMessage({
        conversationId: cidB,
        messageId: sent.id,
        userId: h.alice.id,
        content: 'tampered',
      }),
    ).rejects.toThrow(/not found/i)
  })
})

describeIf('ChatService attachments', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('stages an attachment with messageId=null and lets sendMessage claim it', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)

    await svc.stageAttachment({
      id: 'cat_test_1',
      uploaderId: h.alice.id,
      filename: 'doc.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1234,
      storageKey: '/tmp/cat_test_1',
    })

    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'see attached',
      attachmentIds: ['cat_test_1'],
    })

    const msgs = await svc.listMessages(cid, h.alice.id)
    expect(msgs[0].id).toBe(sent.id)
    expect(msgs[0].attachments).toHaveLength(1)
    expect(msgs[0].attachments[0].filename).toBe('doc.pdf')
    expect(msgs[0].attachments[0].sizeBytes).toBe(1234)
  })

  it('rejects send when an attachment was uploaded by a different user', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)

    await svc.stageAttachment({
      id: 'cat_steal',
      uploaderId: h.bob.id,
      filename: 'leaked.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1,
      storageKey: '/tmp/x',
    })

    await expect(
      svc.sendMessage({
        conversationId: cid,
        senderId: h.alice.id,
        content: '',
        attachmentIds: ['cat_steal'],
      }),
    ).rejects.toThrow(/not owned/i)
  })

  it('rejects re-using an already-claimed attachment', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)

    await svc.stageAttachment({
      id: 'cat_once',
      uploaderId: h.alice.id,
      filename: 'a.txt',
      contentType: 'text/plain',
      sizeBytes: 1,
      storageKey: '/tmp/a',
    })
    await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'first',
      attachmentIds: ['cat_once'],
    })

    await expect(
      svc.sendMessage({
        conversationId: cid,
        senderId: h.alice.id,
        content: 'second',
        attachmentIds: ['cat_once'],
      }),
    ).rejects.toThrow(/already attached/i)
  })

  it('refuses to send a wholly-empty message (no content, no attachments)', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)
    await expect(
      svc.sendMessage({
        conversationId: cid,
        senderId: h.alice.id,
        content: '   ',
      }),
    ).rejects.toThrow(/content or attachment is required/i)
  })

  it('blanks attachments on deleted messages too', async () => {
    const svc = new ChatService(h.db)
    const cid = await svc.createDirect(h.alice.id, h.bob.id)

    await svc.stageAttachment({
      id: 'cat_to_delete',
      uploaderId: h.alice.id,
      filename: 'gone.txt',
      contentType: 'text/plain',
      sizeBytes: 1,
      storageKey: '/tmp/x',
    })
    const sent = await svc.sendMessage({
      conversationId: cid,
      senderId: h.alice.id,
      content: 'has file',
      attachmentIds: ['cat_to_delete'],
    })
    await svc.deleteMessage({
      conversationId: cid,
      messageId: sent.id,
      userId: h.alice.id,
    })

    const msgs = await svc.listMessages(cid, h.alice.id)
    expect(msgs[0].content).toBe('')
    expect(msgs[0].attachments).toEqual([])
  })
})

describeIf('ChatService.searchUsers', () => {
  let h: SeedHandles
  beforeEach(async () => {
    h = await seedChatFixture()
  })

  it('returns users in the same org matching by name (case-insensitive)', async () => {
    const svc = new ChatService(h.db)
    const matches = await svc.searchUsers({
      excludeUserId: h.alice.id,
      orgId: h.orgId,
      query: 'bo',
    })
    const ids = matches.map((u) => u.id)
    expect(ids).toContain(h.bob.id)
    expect(ids).not.toContain(h.alice.id)
    expect(ids).not.toContain(h.outsider.id)
  })

  it('matches against email too', async () => {
    const svc = new ChatService(h.db)
    const matches = await svc.searchUsers({
      excludeUserId: h.alice.id,
      orgId: h.orgId,
      query: h.carol.email.split('@')[0],
    })
    expect(matches.map((u) => u.id)).toContain(h.carol.id)
  })

  it('excludes users from a different org', async () => {
    const svc = new ChatService(h.db)
    const matches = await svc.searchUsers({
      excludeUserId: h.alice.id,
      orgId: h.orgId,
      query: 'zach',
    })
    expect(matches.map((u) => u.id)).not.toContain(h.outsider.id)
  })

  it('returns empty for blank queries', async () => {
    const svc = new ChatService(h.db)
    const matches = await svc.searchUsers({
      excludeUserId: h.alice.id,
      orgId: h.orgId,
      query: '   ',
    })
    expect(matches).toEqual([])
  })
})
