import { describe, expect, it, beforeEach } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import {
  chatAttachments,
  organizations,
  orgMembers,
  users,
} from '@wistmail/db'
import { getDb } from '../lib/db.js'
import { ChatService } from './chat.js'
import { cleanupOrphanChatAttachments } from './chat-attachment-cleanup.js'

const DB_URL = process.env.DATABASE_URL
const describeIf = DB_URL ? describe : describe.skip

async function seedAlice(): Promise<string> {
  const db = getDb()
  const userId = `u_alice_${randomBytes(3).toString('hex')}`
  const orgId = `org_${randomBytes(3).toString('hex')}`
  await db.insert(users).values({
    id: userId,
    email: `alice.${randomBytes(2).toString('hex')}@cleanup-test.example`,
    name: 'Alice',
    passwordHash: 'unused',
    setupComplete: true,
  })
  await db.insert(organizations).values({
    id: orgId,
    name: 'Cleanup Co',
    slug: `cleanup-${randomBytes(3).toString('hex')}`,
    ownerId: userId,
  })
  await db.insert(orgMembers).values({
    id: `om_${randomBytes(3).toString('hex')}`,
    orgId,
    userId,
    role: 'owner',
  })
  return userId
}

describeIf('cleanupOrphanChatAttachments', () => {
  let aliceId: string
  beforeEach(async () => {
    aliceId = await seedAlice()
  })

  it('deletes orphan rows older than the TTL window', async () => {
    const db = getDb()
    const svc = new ChatService(db)
    await svc.stageAttachment({
      id: 'cat_old',
      uploaderId: aliceId,
      filename: 'forgotten.txt',
      contentType: 'text/plain',
      sizeBytes: 1,
      // No bytes were actually written for this test row, so the
      // disk-delete returns false — that's expected and the row
      // should still be removed.
      storageKey: '/tmp/never-existed',
    })
    // Backdate the row to 25h ago.
    await db.execute(sql`
      UPDATE chat_attachments
      SET created_at = ${new Date(Date.now() - 25 * 60 * 60 * 1000)}
      WHERE id = 'cat_old'
    `)

    const result = await cleanupOrphanChatAttachments(db)
    expect(result.rowsDeleted).toBe(1)

    const remaining = await db
      .select()
      .from(chatAttachments)
      .where(eq(chatAttachments.id, 'cat_old'))
    expect(remaining).toHaveLength(0)
  })

  it('keeps recent orphans (within TTL)', async () => {
    const db = getDb()
    const svc = new ChatService(db)
    await svc.stageAttachment({
      id: 'cat_fresh',
      uploaderId: aliceId,
      filename: 'recent.txt',
      contentType: 'text/plain',
      sizeBytes: 1,
      storageKey: '/tmp/recent',
    })

    const result = await cleanupOrphanChatAttachments(db)
    expect(result.rowsDeleted).toBe(0)

    const remaining = await db
      .select()
      .from(chatAttachments)
      .where(eq(chatAttachments.id, 'cat_fresh'))
    expect(remaining).toHaveLength(1)
  })

  it('never reaps attached rows even if they are old', async () => {
    const db = getDb()
    const svc = new ChatService(db)
    const cid = await (async () => {
      // Simplest path: alice talks to bob.
      const bobId = `u_bob_${randomBytes(3).toString('hex')}`
      await db.insert(users).values({
        id: bobId,
        email: `bob.${randomBytes(2).toString('hex')}@cleanup-test.example`,
        name: 'Bob',
        passwordHash: 'unused',
        setupComplete: true,
      })
      return svc.createDirect(aliceId, bobId)
    })()

    await svc.stageAttachment({
      id: 'cat_attached',
      uploaderId: aliceId,
      filename: 'kept.txt',
      contentType: 'text/plain',
      sizeBytes: 1,
      storageKey: '/tmp/kept',
    })
    await svc.sendMessage({
      conversationId: cid,
      senderId: aliceId,
      content: 'see file',
      attachmentIds: ['cat_attached'],
    })
    // Backdate the row — even so, attached rows must not be touched.
    await db.execute(sql`
      UPDATE chat_attachments
      SET created_at = ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
      WHERE id = 'cat_attached'
    `)

    const result = await cleanupOrphanChatAttachments(db)
    expect(result.rowsDeleted).toBe(0)

    const remaining = await db
      .select()
      .from(chatAttachments)
      .where(eq(chatAttachments.id, 'cat_attached'))
    expect(remaining).toHaveLength(1)
  })
})
