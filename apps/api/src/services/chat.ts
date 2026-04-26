import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import {
  chatAttachments,
  chatMessageReads,
  chatMessages,
  conversations,
  conversationParticipants,
  orgMembers,
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

/// drizzle's `db.execute(sql)` returns the driver-native result —
/// `{ rows, rowCount }` on node-postgres and pglite, but a bare array
/// on some adapters. Normalize so callers always get the row array.
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: T[] }).rows
  }
  return []
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

    // Grab the latest non-deleted message for each conversation. If a
    // sender deletes their last message, the row stays for ordering
    // purposes but the conversation preview falls back to the prior
    // message (or null) so we never echo deleted bodies back.
    const latestResult = await this.db.execute(sql`
      SELECT DISTINCT ON (conversation_id)
        id, conversation_id, sender_id, content, created_at
      FROM chat_messages
      WHERE conversation_id IN (${sql.join(conversationIds.map((id) => sql`${id}`), sql`, `)})
        AND deleted_at IS NULL
      ORDER BY conversation_id, created_at DESC
    `)
    const latestByConv = new Map<
      string,
      { id: string; content: string; senderId: string; createdAt: Date }
    >()
    for (const row of rowsOf<Record<string, unknown>>(latestResult)) {
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
   * Soft-deleted messages keep the row (so reply context + ordering hold) but
   * `content` is blanked out — clients render a placeholder bubble. Each row
   * carries its (possibly empty) `attachments` list so a single fetch is enough
   * to render the thread including file chips.
   */
  async listMessages(conversationId: string, userId: string, limit = 100) {
    await this.requireParticipant(conversationId, userId)
    const rows = await this.db
      .select({
        id: chatMessages.id,
        conversationId: chatMessages.conversationId,
        senderId: chatMessages.senderId,
        content: chatMessages.content,
        editedAt: chatMessages.editedAt,
        deletedAt: chatMessages.deletedAt,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)

    if (rows.length === 0) return []

    // Pull every attachment for the page in a single round-trip,
    // then bucket per-message in Node. Cheaper than N selects for
    // long threads.
    const ids = rows.map((m) => m.id)
    const attachments = await this.db
      .select({
        id: chatAttachments.id,
        messageId: chatAttachments.messageId,
        filename: chatAttachments.filename,
        contentType: chatAttachments.contentType,
        sizeBytes: chatAttachments.sizeBytes,
      })
      .from(chatAttachments)
      .where(inArray(chatAttachments.messageId, ids))
    const byMessage = new Map<string, typeof attachments>()
    for (const a of attachments) {
      if (!a.messageId) continue
      const list = byMessage.get(a.messageId) ?? []
      list.push(a)
      byMessage.set(a.messageId, list)
    }

    return rows
      .map((m) => ({
        ...m,
        // Never leak deleted content over the wire.
        content: m.deletedAt ? '' : m.content,
        attachments: m.deletedAt
          ? []
          : (byMessage.get(m.id) ?? []).map((a) => ({
              id: a.id,
              filename: a.filename,
              contentType: a.contentType,
              sizeBytes: a.sizeBytes,
            })),
      }))
      .reverse()
  }

  /// Stage an uploaded attachment. Bytes are written to disk by the
  /// route layer using the same `id` we record here, so the row PK
  /// matches the storage path key — `openAttachmentStream(id)` works
  /// without a separate lookup.
  async stageAttachment(input: {
    id: string
    uploaderId: string
    filename: string
    contentType: string
    sizeBytes: number
    storageKey: string
  }): Promise<void> {
    await this.db.insert(chatAttachments).values({
      id: input.id,
      messageId: null,
      uploaderId: input.uploaderId,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
    })
  }

  /// Lookup a single attachment row. Caller must check that the
  /// downloader is a participant of the message's conversation.
  async getAttachment(attachmentId: string) {
    const rows = await this.db
      .select()
      .from(chatAttachments)
      .where(eq(chatAttachments.id, attachmentId))
      .limit(1)
    return rows[0] ?? null
  }

  /// Verify each id was uploaded by `uploaderId` AND is still
  /// unattached. Throws if any id is missing or already claimed —
  /// the send call rejects rather than silently dropping refs.
  private async claimAttachments(
    attachmentIds: string[],
    uploaderId: string,
    messageId: string,
  ): Promise<void> {
    if (attachmentIds.length === 0) return
    const dedup = Array.from(new Set(attachmentIds))
    const rows = await this.db
      .select({
        id: chatAttachments.id,
        uploaderId: chatAttachments.uploaderId,
        messageId: chatAttachments.messageId,
      })
      .from(chatAttachments)
      .where(inArray(chatAttachments.id, dedup))

    if (rows.length !== dedup.length) {
      throw new Error('Attachment not found')
    }
    for (const r of rows) {
      if (r.uploaderId !== uploaderId) {
        throw new Error('Attachment not owned by sender')
      }
      if (r.messageId !== null) {
        throw new Error('Attachment already attached to a message')
      }
    }
    await this.db
      .update(chatAttachments)
      .set({ messageId })
      .where(
        and(
          inArray(chatAttachments.id, dedup),
          isNull(chatAttachments.messageId),
        ),
      )
  }

  async sendMessage(input: {
    conversationId: string
    senderId: string
    content: string
    attachmentIds?: string[]
  }) {
    await this.requireParticipant(input.conversationId, input.senderId)
    const attachmentIds = input.attachmentIds ?? []
    if (input.content.trim().length === 0 && attachmentIds.length === 0) {
      throw new Error('Message content or attachment is required')
    }

    const messageId = generateId('msg')
    const now = new Date()

    await this.db.insert(chatMessages).values({
      id: messageId,
      conversationId: input.conversationId,
      senderId: input.senderId,
      content: input.content,
      createdAt: now,
    })

    // Claim any staged attachments — must run BEFORE we publish
    // events / update participants so a failure rolls back cleanly
    // (the message row stays orphaned but no events fired).
    try {
      await this.claimAttachments(attachmentIds, input.senderId, messageId)
    } catch (err) {
      // Roll back the bare message row so the thread doesn't show an
      // empty bubble for an attachment that was never claimed.
      await this.db.delete(chatMessages).where(eq(chatMessages.id, messageId))
      throw err
    }

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

  /// Snapshot every participant's per-user unread count for a
  /// conversation. Used by the route layer to fan out
  /// `chat.conversation.updated` events without making N round-trips.
  async listParticipantsWithUnread(conversationId: string) {
    return this.db
      .select({
        userId: conversationParticipants.userId,
        unreadCount: conversationParticipants.unreadCount,
      })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId))
  }

  async getConversation(conversationId: string) {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1)
    return rows[0] ?? null
  }

  async markRead(conversationId: string, userId: string) {
    await this.requireParticipant(conversationId, userId)
    const now = new Date()

    // Capture the prior `lastReadAt` so we only consider messages
    // arrived since then for the per-message receipt write. Skipping
    // already-acknowledged ones keeps the per-message insert bounded
    // even on hot conversations.
    const before = await this.db
      .select({ lastReadAt: conversationParticipants.lastReadAt })
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
        ),
      )
      .limit(1)
    const since = before[0]?.lastReadAt ?? new Date(0)

    await this.db
      .update(conversationParticipants)
      .set({ unreadCount: 0, lastReadAt: now })
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, userId),
        ),
      )

    // Bulk-write per-message read receipts for newly-seen messages.
    // ON CONFLICT DO NOTHING — re-marking the same message read is a
    // no-op so concurrent opens on multiple devices don't error.
    await this.db.execute(sql`
      INSERT INTO chat_message_reads (message_id, user_id, read_at)
      SELECT m.id, ${userId}, ${now}
      FROM chat_messages m
      WHERE m.conversation_id = ${conversationId}
        AND m.created_at > ${since}
        AND m.deleted_at IS NULL
        AND m.sender_id <> ${userId}
      ON CONFLICT (message_id, user_id) DO NOTHING
    `)
  }

  /// Edit the body of a message. Only the original sender may edit.
  /// Editing a deleted message fails. The conversation's lastMessageAt
  /// is intentionally NOT bumped — edits shouldn't surface the
  /// conversation back to the top of every member's list.
  ///
  /// `conversationId` comes from the URL and must match the message's
  /// actual conversation; mismatches surface as "Message not found"
  /// (we never confirm a message exists in a chat the caller can't
  /// see).
  async editMessage(input: {
    conversationId: string
    messageId: string
    userId: string
    content: string
  }): Promise<{ id: string; conversationId: string; content: string; editedAt: Date }> {
    const trimmed = input.content.trim()
    if (trimmed.length === 0) {
      throw new Error('Message content is required')
    }
    const msg = await this.getMessage(input.messageId)
    if (!msg || msg.conversationId !== input.conversationId) {
      throw new Error('Message not found')
    }
    if (msg.senderId !== input.userId) {
      throw new Error('Only the sender can edit this message')
    }
    if (msg.deletedAt) {
      throw new Error('Cannot edit a deleted message')
    }
    const editedAt = new Date()
    await this.db
      .update(chatMessages)
      .set({ content: trimmed, editedAt })
      .where(eq(chatMessages.id, input.messageId))
    return {
      id: msg.id,
      conversationId: msg.conversationId,
      content: trimmed,
      editedAt,
    }
  }

  /// Soft-delete a message. The row stays so reply context, ordering
  /// and read receipts remain consistent; subsequent reads return an
  /// empty content body. Only the original sender may delete. URL-
  /// supplied `conversationId` must match the message's actual
  /// conversation.
  async deleteMessage(input: {
    conversationId: string
    messageId: string
    userId: string
  }): Promise<{ id: string; conversationId: string; deletedAt: Date }> {
    const msg = await this.getMessage(input.messageId)
    if (!msg || msg.conversationId !== input.conversationId) {
      throw new Error('Message not found')
    }
    if (msg.senderId !== input.userId) {
      throw new Error('Only the sender can delete this message')
    }
    if (msg.deletedAt) {
      // Idempotent — return the existing deletion timestamp.
      return { id: msg.id, conversationId: msg.conversationId, deletedAt: msg.deletedAt }
    }
    const deletedAt = new Date()
    await this.db
      .update(chatMessages)
      .set({ deletedAt })
      .where(eq(chatMessages.id, input.messageId))
    return { id: msg.id, conversationId: msg.conversationId, deletedAt }
  }

  async getMessage(messageId: string) {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, messageId))
      .limit(1)
    return rows[0] ?? null
  }

  /// Returns the readers of a single message — joined with users so
  /// clients can render avatars without a follow-up fetch. Caller must
  /// be a participant of the message's conversation, and the URL-
  /// supplied `conversationId` must match the message's actual
  /// conversation.
  async listMessageReads(input: {
    conversationId: string
    messageId: string
    requesterId: string
  }) {
    const msg = await this.getMessage(input.messageId)
    if (!msg || msg.conversationId !== input.conversationId) {
      throw new Error('Message not found')
    }
    await this.requireParticipant(msg.conversationId, input.requesterId)
    return this.db
      .select({
        userId: chatMessageReads.userId,
        name: users.name,
        avatarUrl: users.avatarUrl,
        readAt: chatMessageReads.readAt,
      })
      .from(chatMessageReads)
      .innerJoin(users, eq(users.id, chatMessageReads.userId))
      .where(eq(chatMessageReads.messageId, input.messageId))
  }

  /// Read-set summary for an entire conversation — one row per
  /// (messageId, userId) where the user has read the message. Used by
  /// clients to render the seen-by row without N round-trips.
  async listConversationReads(conversationId: string, requesterId: string) {
    await this.requireParticipant(conversationId, requesterId)
    return this.db
      .select({
        messageId: chatMessageReads.messageId,
        userId: chatMessageReads.userId,
        readAt: chatMessageReads.readAt,
      })
      .from(chatMessageReads)
      .innerJoin(
        chatMessages,
        eq(chatMessages.id, chatMessageReads.messageId),
      )
      .where(eq(chatMessages.conversationId, conversationId))
  }

  /// Create a multi-participant group conversation. The creator is
  /// auto-added; any duplicate IDs in `participantIds` are deduped
  /// before insert. `lastMessageAt` is initialized to creation time
  /// so the new group surfaces at the top of every member's list
  /// even before the first message arrives.
  async createGroup(input: {
    creatorId: string
    title: string
    participantIds: string[]
  }): Promise<string> {
    const title = input.title.trim()
    if (title.length === 0) {
      throw new Error('Group title is required')
    }
    const others = Array.from(
      new Set(input.participantIds.filter((id) => id !== input.creatorId)),
    )
    if (others.length === 0) {
      throw new Error('Group must have at least one other participant')
    }

    const id = generateId('cnv')
    const now = new Date()
    await this.db.insert(conversations).values({
      id,
      kind: 'group',
      title,
      createdBy: input.creatorId,
      lastMessageAt: now,
    })
    await this.db.insert(conversationParticipants).values(
      [input.creatorId, ...others].map((userId) => ({
        conversationId: id,
        userId,
      })),
    )
    return id
  }

  /// Adds new members to an existing group. Idempotent: callers
  /// passing already-present user IDs just see them silently dropped.
  /// Throws if the conversation is `direct` (membership is fixed at
  /// creation) or if `byUserId` isn't currently a member.
  async addParticipants(
    conversationId: string,
    byUserId: string,
    newUserIds: string[],
  ): Promise<{ added: string[] }> {
    await this.requireParticipant(conversationId, byUserId)
    const conv = await this.getConversation(conversationId)
    if (!conv || conv.kind !== 'group') {
      throw new Error('Cannot add participants to a non-group conversation')
    }
    const existing = await this.db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId))
    const existingSet = new Set(existing.map((r) => r.userId))
    const toAdd = Array.from(new Set(newUserIds)).filter(
      (uid) => !existingSet.has(uid),
    )
    if (toAdd.length === 0) return { added: [] }

    await this.db.insert(conversationParticipants).values(
      toAdd.map((userId) => ({ conversationId, userId })),
    )
    return { added: toAdd }
  }

  /// Removes a participant from a group. Self-leave is always
  /// permitted; removing another member requires being the creator.
  async removeParticipant(
    conversationId: string,
    byUserId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.requireParticipant(conversationId, byUserId)
    const conv = await this.getConversation(conversationId)
    if (!conv || conv.kind !== 'group') {
      throw new Error('Cannot remove participants from a non-group conversation')
    }
    if (byUserId !== targetUserId && conv.createdBy !== byUserId) {
      throw new Error('Only the group creator can remove other participants')
    }
    await this.db
      .delete(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conversationId),
          eq(conversationParticipants.userId, targetUserId),
        ),
      )
  }

  /// Full member list for a conversation. Caller must be a current
  /// member. Returns user-shaped rows so clients can render avatars
  /// + the "remove" affordance without a second fetch.
  async listParticipants(conversationId: string, requesterId: string) {
    await this.requireParticipant(conversationId, requesterId)
    return this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(eq(conversationParticipants.conversationId, conversationId))
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
    const existingRows = rowsOf<{ id: string }>(existing)
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

  /// Org-scoped contact search. Returns users in the same org as
  /// `excludeUserId` whose name or email matches the (case-insensitive)
  /// query as a prefix or substring. Excludes the requesting user so
  /// they can't accidentally start a chat with themselves.
  async searchUsers(input: {
    excludeUserId: string
    orgId: string
    query: string
    limit?: number
  }) {
    const q = input.query.trim()
    if (q.length === 0) return []
    const limit = Math.min(input.limit ?? 10, 25)
    const pattern = `%${q}%`

    return this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
      .where(
        and(
          eq(orgMembers.orgId, input.orgId),
          ne(users.id, input.excludeUserId),
          or(ilike(users.name, pattern), ilike(users.email, pattern)),
        ),
      )
      .limit(limit)
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
