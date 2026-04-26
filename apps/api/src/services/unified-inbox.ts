import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import {
  conversationParticipants,
  conversations,
  emails,
  mailboxes,
  users,
} from '@wistmail/db'
import type { Database } from '@wistmail/db'

export type UnifiedFilter = 'all' | 'mail' | 'chats'

export interface UnifiedItem {
  source: 'mail' | 'chat'
  id: string
  // Sort/bucket key — stable across sources (email.createdAt or message.createdAt).
  occurredAt: Date
  // Shared display fields so the client's row widget is source-agnostic.
  // Mail: sender name derived from From address.
  // Chat: sender's user name.
  senderName: string
  senderKey: string // address OR userId — used for the avatar seed.
  preview: string // subject (mail) or message snippet (chat)
  subtitle: string // mail: snippet body; chat: conversation title or "@senderName"
  isUnread: boolean
  // Extra source-specific payload. Kept lean — full detail fetched on tap.
  mail?: {
    emailId: string
    threadId: string | null
    fromAddress: string
    needsReply: boolean
  }
  chat?: {
    conversationId: string
    kind: 'direct' | 'group'
  }
}

export interface UnifiedPage {
  items: UnifiedItem[]
  hasMore: boolean
  nextCursor: string | null // ISO timestamp of the last item when more pages exist.
}

interface Params {
  userId: string
  filter: UnifiedFilter
  limit: number
  before: Date | null
}

export async function unifiedInbox(
  db: Database,
  { userId, filter, limit, before }: Params,
): Promise<UnifiedPage> {
  // Overfetch each source so the merged slice is accurate after sort+clamp.
  // We intentionally pull `limit` from each side so the final `limit`
  // result always has enough headroom — the worst case for mismatch
  // is all results coming from one source.
  const perSource = limit

  const mailPromise: Promise<UnifiedItem[]> =
    filter === 'chats'
      ? Promise.resolve([])
      : (async () => {
          const mailboxIds = (
            await db
              .select({ id: mailboxes.id })
              .from(mailboxes)
              .where(eq(mailboxes.userId, userId))
          ).map((m) => m.id)
          if (mailboxIds.length === 0) return []

          const conditions = [
            inArray(emails.mailboxId, mailboxIds),
            eq(emails.folder, 'inbox'),
          ]
          if (before) conditions.push(lt(emails.createdAt, before))

          const rows = await db
            .select({
              id: emails.id,
              subject: emails.subject,
              fromAddress: emails.fromAddress,
              fromName: emails.fromName,
              textBody: emails.textBody,
              isRead: emails.isRead,
              threadId: emails.threadId,
              needsReply: emails.needsReply,
              createdAt: emails.createdAt,
            })
            .from(emails)
            .where(and(...conditions))
            .orderBy(desc(emails.createdAt))
            .limit(perSource)

          return rows.map((r): UnifiedItem => {
            // Prefer the From header's display name; fall back to the
            // local-part heuristic only when the sender's MTA didn't
            // provide one.
            const senderName = r.fromName ?? extractDisplayName(r.fromAddress)
            const snippet = (r.textBody || '').trim().slice(0, 140)
            return {
              source: 'mail',
              id: `mail:${r.id}`,
              occurredAt: r.createdAt,
              senderName,
              senderKey: r.fromAddress.toLowerCase(),
              preview: r.subject || '(no subject)',
              subtitle: snippet,
              isUnread: !r.isRead,
              mail: {
                emailId: r.id,
                threadId: r.threadId,
                fromAddress: r.fromAddress,
                needsReply: r.needsReply === true,
              },
            }
          })
        })()

  const chatPromise: Promise<UnifiedItem[]> =
    filter === 'mail'
      ? Promise.resolve([])
      : (async () => {
          // Get the user's conversation memberships with unread counts,
          // then pull the latest message per conversation in one SQL hit.
          const memberships = await db
            .select({
              conversationId: conversationParticipants.conversationId,
              unreadCount: conversationParticipants.unreadCount,
              lastReadAt: conversationParticipants.lastReadAt,
              kind: conversations.kind,
              title: conversations.title,
              lastMessageAt: conversations.lastMessageAt,
            })
            .from(conversationParticipants)
            .innerJoin(
              conversations,
              eq(conversations.id, conversationParticipants.conversationId),
            )
            .where(eq(conversationParticipants.userId, userId))
            .orderBy(desc(conversations.lastMessageAt))
            .limit(perSource)
          if (memberships.length === 0) return []

          const convIds = memberships.map((m) => m.conversationId)
          const latestRows = (await db.execute(sql`
            SELECT DISTINCT ON (conversation_id)
              id, conversation_id, sender_id, content, created_at
            FROM chat_messages
            WHERE conversation_id IN (${sql.join(
              convIds.map((id) => sql`${id}`),
              sql`, `,
            )})
            ${before ? sql`AND created_at < ${before.toISOString()}` : sql``}
            ORDER BY conversation_id, created_at DESC
          `)) as unknown as Array<{
            id: string
            conversation_id: string
            sender_id: string
            content: string
            created_at: string
          }>
          const latestByConv = new Map(
            latestRows.map((r) => [r.conversation_id, r]),
          )

          // Names for other participants (for "direct" conversations we show
          // the other person; for groups we fall back to the title).
          const senderIds = Array.from(new Set(latestRows.map((r) => r.sender_id)))
          const senderUsers =
            senderIds.length === 0
              ? []
              : await db
                  .select({ id: users.id, name: users.name, email: users.email })
                  .from(users)
                  .where(inArray(users.id, senderIds))
          const userById = new Map(senderUsers.map((u) => [u.id, u]))

          const items: UnifiedItem[] = []
          for (const m of memberships) {
            const latest = latestByConv.get(m.conversationId)
            if (!latest) continue // conversation has no messages yet (or all before cursor)
            const createdAt = new Date(latest.created_at)
            const sender = userById.get(latest.sender_id)
            const senderName = sender?.name ?? 'Someone'
            const title =
              m.kind === 'direct' ? senderName : m.title ?? 'Group chat'
            items.push({
              source: 'chat',
              id: `chat:${latest.id}`,
              occurredAt: createdAt,
              senderName,
              senderKey: sender?.email?.toLowerCase() ?? latest.sender_id,
              preview: title,
              subtitle:
                m.kind === 'group'
                  ? `${senderName}: ${latest.content.slice(0, 120)}`
                  : latest.content.slice(0, 140),
              isUnread: m.unreadCount > 0,
              chat: {
                conversationId: m.conversationId,
                kind: m.kind as 'direct' | 'group',
              },
            })
          }
          return items
        })()

  const [mailItems, chatItems] = await Promise.all([mailPromise, chatPromise])

  const merged = [...mailItems, ...chatItems].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  )
  const clamped = merged.slice(0, limit)
  const hasMore = merged.length > limit
  const nextCursor =
    hasMore && clamped.length > 0
      ? clamped[clamped.length - 1].occurredAt.toISOString()
      : null

  return { items: clamped, hasMore, nextCursor }
}

// Very light RFC 5322 name extraction. "Veda <veda@wistmail.io>" → "Veda";
// bare address "veda@wistmail.io" → "veda". Good enough for a list row —
// full parsing happens in the detail view.
function extractDisplayName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/)
  if (m) return m[1].trim()
  const local = from.split('@')[0]
  return local || from
}
