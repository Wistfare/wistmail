import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  chatMessages,
  conversations,
  conversationParticipants,
  users,
} from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

export interface ConversationSummary {
  id: string
  kind: 'direct' | 'group'
  title: string | null
  lastMessageAt: Date
  unreadCount: number
  otherParticipants: { id: string; name: string; email: string; avatarUrl: string | null }[]
  lastMessage: { id: string; content: string; senderId: string; createdAt: Date } | null
}

export class ChatService {
  constructor(private db: Database) {}

  async listForUser(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.db
      .select({
        id: conversations.id,
        kind: conversations.kind,
        title: conversations.title,
        lastMessageAt: conversations.lastMessageAt,
        unreadCount: conversationParticipants.unreadCount,
      })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
      .where(eq(conversationParticipants.userId, userId))
      .orderBy(desc(conversations.lastMessageAt))

    if (rows.length === 0) return []

    const conversationIds = rows.map((r) => r.id)

    // DB-side filter: exclude the requesting user from the result rather
    // than fetching every participant and discarding self in Node.
    const allParticipants = await this.db
      .select({
        conversationId: conversationParticipants.conversationId,
        userId: conversationParticipants.userId,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatarUrl,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(
        and(
          inArray(conversationParticipants.conversationId, conversationIds),
          sql`${conversationParticipants.userId} <> ${userId}`,
        ),
      )

    const byConversation = new Map<
      string,
      { id: string; name: string; email: string; avatarUrl: string | null }[]
    >()
    for (const p of allParticipants) {
      const list = byConversation.get(p.conversationId) ?? []
      list.push({
        id: p.userId,
        name: p.userName,
        email: p.userEmail,
        avatarUrl: p.userAvatar,
      })
      byConversation.set(p.conversationId, list)
    }

    // Grab the latest message for each conversation in one round trip.
    const latestMessages = await this.db.execute(sql`
      SELECT DISTINCT ON (conversation_id)
        id, conversation_id, sender_id, content, created_at
      FROM chat_messages
      WHERE conversation_id IN (${sql.join(conversationIds.map((id) => sql`${id}`), sql`, `)})
      ORDER BY conversation_id, created_at DESC
    `)
    const latestByConv = new Map<
      string,
      { id: string; content: string; senderId: string; createdAt: Date }
    >()
    for (const row of latestMessages as unknown as Array<Record<string, unknown>>) {
      latestByConv.set(row.conversation_id as string, {
        id: row.id as string,
        content: row.content as string,
        senderId: row.sender_id as string,
        createdAt: new Date(row.created_at as string),
      })
    }

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as 'direct' | 'group',
      title: r.title,
      lastMessageAt: r.lastMessageAt,
      unreadCount: r.unreadCount,
      otherParticipants: byConversation.get(r.id) ?? [],
      lastMessage: latestByConv.get(r.id) ?? null,
    }))
  }

  /**
   * Returns messages ordered oldest-first (scroll-up to load older would reverse).
   */
  async listMessages(conversationId: string, userId: string, limit = 100) {
    await this.requireParticipant(conversationId, userId)
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
    return rows.reverse()
  }

  async sendMessage(input: {
    conversationId: string
    senderId: string
    content: string
  }) {
    await this.requireParticipant(input.conversationId, input.senderId)
    const messageId = generateId('msg')
    const now = new Date()

    await this.db.insert(chatMessages).values({
      id: messageId,
      conversationId: input.conversationId,
      senderId: input.senderId,
      content: input.content,
      createdAt: now,
    })

    await this.db
      .update(conversations)
      .set({ lastMessageAt: now })
      .where(eq(conversations.id, input.conversationId))

    // Increment unreadCount for all other participants
    await this.db
      .update(conversationParticipants)
      .set({ unreadCount: sql`${conversationParticipants.unreadCount} + 1` })
      .where(
        and(
          eq(conversationParticipants.conversationId, input.conversationId),
          sql`${conversationParticipants.userId} <> ${input.senderId}`,
        ),
      )

    return { id: messageId, createdAt: now }
  }

  async listOtherParticipants(conversationId: string, excludeUserId: string) {
    return this.db
      .select({
        userId: conversationParticipants.userId,
        name: users.name,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          sql`${conversationParticipants.userId} <> ${excludeUserId}`,
        ),
      )
  }

  async markRead(conversationId: string, userId: string) {
    await this.requireParticipant(conversationId, userId)
    await this.db
      .update(conversationParticipants)
      .set({ unreadCount: 0, lastReadAt: new Date() })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
        ),
      )
  }

  async createDirect(userIdA: string, userIdB: string): Promise<string> {
    if (userIdA === userIdB) {
      throw new Error('Cannot create a direct conversation with yourself')
    }

    // Look for an existing direct conversation with exactly these two users.
    const existing = await this.db.execute(sql`
      SELECT c.id
      FROM conversations c
      WHERE c.kind = 'direct'
        AND (
          SELECT COUNT(*) FROM conversation_participants p
          WHERE p.conversation_id = c.id
        ) = 2
        AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = ${userIdA})
        AND EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = c.id AND user_id = ${userIdB})
      LIMIT 1
    `)
    const existingRows = existing as unknown as Array<{ id: string }>
    if (existingRows.length > 0) return existingRows[0].id

    const id = generateId('cnv')
    await this.db.insert(conversations).values({
      id,
      kind: 'direct',
      createdBy: userIdA,
    })

    await this.db.insert(conversationParticipants).values([
      { conversationId: id, userId: userIdA },
      { conversationId: id, userId: userIdB },
    ])

    return id
  }

  private async requireParticipant(conversationId: string, userId: string) {
    const result = await this.db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
        ),
      )
      .limit(1)
    if (result.length === 0) {
      throw new Error('Not a participant in this conversation')
    }
  }
}
