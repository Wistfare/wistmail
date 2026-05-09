import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import {
  attachments,
  conversations,
  conversationParticipants,
  emails,
  emailLabels,
  labels,
  mailboxes,
  users,
} from '@wistmail/db'
import type { Database } from '@wistmail/db'
import { searchEmails, searchEnabled } from './search.js'
import {
  searchChatMessages,
  chatSearchEnabled,
  type ChatSearchHit,
} from './chat-search.js'

/// Snippet preview cap — same value `email.ts` uses so mail rows stay
/// consistent regardless of which list endpoint surfaced them.
const PREVIEW_CHARS = 200

/// Default page size — server picks this when the client doesn't
/// override. Capped lower than the bulk-export cap to keep the unified
/// merge cheap.
const DEFAULT_LIMIT = 50

/// Hard upper bound on per-request page size. Without this a crafted
/// `?limit=10000` request would force the server to over-fetch
/// `2 * 10000` rows just to merge.
const MAX_LIMIT = 100

export type FeedItemKind = 'email' | 'chat-direct' | 'chat-group'

export interface FeedLabelRef {
  id: string
  name: string
  color: string
}

/// Discriminated row returned by the unified inbox feed.
///
/// `kind === 'email'` carries the same display fields the legacy
/// `EmailListItem` carried (subject, snippet, hasAttachments, labels,
/// thread id, send-state). `kind === 'chat-direct' | 'chat-group'`
/// carries conversation-shaped fields (title, otherParticipants,
/// per-conversation unread count). The `tag` field is the row chip
/// the V3 EmailRowV3 component reads — `MAIL` / `CHAT` / `CHANNEL`.
export type FeedItem =
  | {
      kind: 'email'
      id: string
      tag: 'MAIL'
      /// Sortable timestamp — wire format is ISO 8601 UTC.
      activityAt: string
      isRead: boolean
      isStarred: boolean
      /// Sender label preferred by the row renderer (RFC-5322 from-name
      /// when present, otherwise the local-part of fromAddress).
      displayName: string
      fromAddress: string
      /// Comma-joined recipients for the reading-pane header. We send
      /// the array; the client renders.
      toAddresses: string[]
      cc: string[]
      subject: string
      snippet: string
      folder: string
      isDraft: boolean
      hasAttachments: boolean
      sizeBytes: number
      status: 'idle' | 'sending' | 'sent' | 'failed' | 'rate_limited'
      sendError: string | null
      mailboxId: string
      labels: FeedLabelRef[]
      threadId: string | null
    }
  | {
      kind: 'chat-direct'
      id: string
      tag: 'CHAT'
      activityAt: string
      /// `true` once the requesting user has read every message; the
      /// row's "unread chip" hides when this flips on.
      isRead: boolean
      /// Number of messages the requesting user has not seen.  Drives
      /// the lime unread chip count on the row.
      unreadCount: number
      /// The other participant's display name. Direct chats are 1:1.
      displayName: string
      otherParticipants: ChatParticipant[]
      snippet: string
      /// Last message timestamp in the conversation (mirrors
      /// `activityAt`; kept separate so callers can distinguish row
      /// position from raw message time if needed).
      lastMessageAt: string
    }
  | {
      kind: 'chat-group'
      id: string
      tag: 'CHANNEL'
      activityAt: string
      isRead: boolean
      unreadCount: number
      /// Group title. Falls back to a comma-joined participant list on
      /// the client when null — server-side we just send what's stored.
      title: string | null
      /// Same shape as direct, used for the avatar stack on group rows.
      otherParticipants: ChatParticipant[]
      snippet: string
      lastMessageAt: string
    }

export interface ChatParticipant {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export interface FeedListParams {
  userId: string
  /// Mail folder filter. `inbox` (default) is the only folder that
  /// surfaces chat rows; sent/drafts/trash/etc. are mail-only by
  /// definition (chats don't have folders).
  folder?: string
  /// Item-type filter applied AFTER the folder filter.  Default
  /// `all` returns mail + chats when folder=inbox, mail-only otherwise.
  kind?: 'all' | 'mail' | 'chats'
  /// Cursor — opaque to the client. Internally an ISO timestamp;
  /// rows older than this are returned. `null` / undefined returns the
  /// most recent page.
  cursor?: string | null
  /// Page size. Server clamps to [1, MAX_LIMIT].
  limit?: number
  /// Search query. When non-empty the server hits MeiliSearch instead
  /// of Postgres.  The same `kind` filter applies — searching with
  /// `kind=chats` only consults the chat index, etc.
  q?: string
}

export interface FeedListResult {
  data: FeedItem[]
  nextCursor: string | null
  /// Unread *items* (rows) for the current filter — emails-with-
  /// is_read=false plus conversations-with-unread-count>0. Mirrors
  /// what Pencil's "23 UNREAD · 2 MENTIONS" subtitle reads from. We
  /// don't yet emit a mention count; clients render `0 mentions` for
  /// now.
  unreadCount: number
}

export class FeedService {
  constructor(private db: Database) {}

  async list(params: FeedListParams): Promise<FeedListResult> {
    const userId = params.userId
    const folder = params.folder ?? 'inbox'
    const kind = params.kind ?? 'all'
    const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT))
    const cursor = params.cursor ?? null
    const q = params.q?.trim() ?? ''

    // Mail rows show in every folder. Chats only show on `inbox` —
    // no semantic mapping for "sent/drafts/trash conversations".
    const wantsMail = kind === 'all' || kind === 'mail'
    const wantsChats = (kind === 'all' || kind === 'chats') && folder === 'inbox'

    if (q.length > 0) {
      // Search path — bypass Postgres entirely. Each enabled index is
      // queried in parallel and the results merged by activityAt DESC.
      return this.searchAcross({
        userId,
        kind,
        folder,
        wantsMail,
        wantsChats,
        cursor,
        limit,
        q,
      })
    }

    // Listing path — over-fetch up to `limit` from each enabled
    // source so the merged page can always populate `limit` items
    // even when one stream is much sparser than the other.
    const fetchSize = limit
    const cursorDate = cursor ? new Date(cursor) : null

    const [mailRows, chatRows] = await Promise.all([
      wantsMail ? this.fetchMailRows(userId, folder, cursorDate, fetchSize) : Promise.resolve<FeedItem[]>([]),
      wantsChats ? this.fetchChatRows(userId, cursorDate, fetchSize) : Promise.resolve<FeedItem[]>([]),
    ])

    // Merge by activityAt DESC. Stable on ties (mail before chat) —
    // arbitrary but consistent so cursor pagination is deterministic.
    const merged = mergeByActivity(mailRows, chatRows).slice(0, limit)
    const nextCursor =
      merged.length === limit
        ? merged[merged.length - 1]?.activityAt ?? null
        : null

    const unreadCount = await this.countUnread({ userId, folder, kind, wantsMail, wantsChats })

    return { data: merged, nextCursor, unreadCount }
  }

  // ---------------------------------------------------------------------
  // Mail listing
  // ---------------------------------------------------------------------

  private async fetchMailRows(
    userId: string,
    folder: string,
    cursorDate: Date | null,
    limit: number,
  ): Promise<FeedItem[]> {
    const mailboxIds = await this.resolveMailboxIds(userId)
    if (mailboxIds.length === 0) return []

    const where = this.buildFolderWhere(folder, mailboxIds, cursorDate)

    const snippetExpr = sql<string>`coalesce(substring(${emails.textBody}, 1, ${
      PREVIEW_CHARS * 4
    }), '')`
    const hasAttExpr = sql<boolean>`exists(select 1 from ${attachments} where ${attachments.emailId} = ${emails.id})`

    const rows = await this.db
      .select({
        id: emails.id,
        mailboxId: emails.mailboxId,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        toAddresses: emails.toAddresses,
        cc: emails.cc,
        subject: emails.subject,
        snippetRaw: snippetExpr,
        folder: emails.folder,
        isRead: emails.isRead,
        isStarred: emails.isStarred,
        isDraft: emails.isDraft,
        hasAttachments: hasAttExpr,
        sizeBytes: emails.sizeBytes,
        status: emails.status,
        sendError: emails.sendError,
        threadId: emails.threadId,
        createdAt: emails.createdAt,
      })
      .from(emails)
      .where(where)
      .orderBy(desc(emails.createdAt))
      .limit(limit)

    if (rows.length === 0) return []

    const labelMap = await this.hydrateLabels(rows.map((r) => r.id))

    return rows.map((r): FeedItem => ({
      kind: 'email',
      tag: 'MAIL',
      id: r.id,
      activityAt: r.createdAt.toISOString(),
      isRead: r.isRead,
      isStarred: r.isStarred,
      displayName: r.fromName ?? extractDisplayLocal(r.fromAddress),
      fromAddress: r.fromAddress,
      toAddresses: r.toAddresses,
      cc: r.cc,
      subject: r.subject,
      snippet: buildSnippet(r.snippetRaw),
      folder: r.folder,
      isDraft: r.isDraft,
      hasAttachments: r.hasAttachments,
      sizeBytes: r.sizeBytes,
      status: (r.status ?? 'idle') as 'idle' | 'sending' | 'sent' | 'failed' | 'rate_limited',
      sendError: r.sendError,
      mailboxId: r.mailboxId,
      labels: labelMap.get(r.id) ?? [],
      threadId: r.threadId,
    }))
  }

  /// Drives the WHERE clause for the mail half of the feed. Mirrors
  /// EmailService.buildFolderWhere — kept here so feed.ts is
  /// self-contained and we can layer the cursor predicate on without
  /// editing the legacy listByFolder path. Cursor adds a strict
  /// `created_at < cursor` filter so pagination stays cleanly
  /// half-open.
  private buildFolderWhere(folder: string, mailboxIds: string[], cursor: Date | null) {
    const inMailbox = inArray(emails.mailboxId, mailboxIds)
    const now = new Date()
    const cursorPred = cursor ? lt(emails.createdAt, cursor) : undefined

    let pred
    switch (folder) {
      case 'starred':
        pred = and(inMailbox, eq(emails.isStarred, true), sql`${emails.folder} <> 'trash'`)
        break
      case 'snoozed':
        pred = and(
          inMailbox,
          sql`${emails.snoozeUntil} IS NOT NULL`,
          sql`${emails.snoozeUntil} > ${now}`,
        )
        break
      case 'scheduled':
        pred = and(
          inMailbox,
          sql`${emails.scheduledAt} IS NOT NULL`,
          sql`${emails.scheduledAt} > ${now}`,
        )
        break
      case 'all':
        pred = inMailbox
        break
      case 'inbox':
        pred = and(
          inMailbox,
          eq(emails.folder, 'inbox'),
          or(isNull(emails.snoozeUntil), lte(emails.snoozeUntil, now)),
        )
        break
      default:
        pred = and(inMailbox, eq(emails.folder, folder))
    }

    return cursorPred ? and(pred, cursorPred) : pred
  }

  private async resolveMailboxIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.userId, userId))
    return rows.map((m) => m.id)
  }

  /// Same shape as EmailService.hydrateLabels — duplicated here so
  /// feed.ts has no cross-service import. The cost is one extra
  /// definition; the gain is a self-contained query path.
  private async hydrateLabels(emailIds: string[]): Promise<Map<string, FeedLabelRef[]>> {
    const map = new Map<string, FeedLabelRef[]>()
    if (emailIds.length === 0) return map
    const rows = await this.db
      .select({
        emailId: emailLabels.emailId,
        id: labels.id,
        name: labels.name,
        color: labels.color,
      })
      .from(emailLabels)
      .innerJoin(labels, eq(labels.id, emailLabels.labelId))
      .where(inArray(emailLabels.emailId, emailIds))
    for (const r of rows) {
      const list = map.get(r.emailId) ?? []
      list.push({ id: r.id, name: r.name, color: r.color })
      map.set(r.emailId, list)
    }
    return map
  }

  // ---------------------------------------------------------------------
  // Chat listing
  // ---------------------------------------------------------------------

  private async fetchChatRows(
    userId: string,
    cursorDate: Date | null,
    limit: number,
  ): Promise<FeedItem[]> {
    const cursorPred = cursorDate
      ? lt(conversations.lastMessageAt, cursorDate)
      : undefined

    const convRows = await this.db
      .select({
        id: conversations.id,
        kind: conversations.kind,
        title: conversations.title,
        lastMessageAt: conversations.lastMessageAt,
        unreadCount: conversationParticipants.unreadCount,
      })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
      .where(
        cursorPred
          ? and(eq(conversationParticipants.userId, userId), cursorPred)
          : eq(conversationParticipants.userId, userId),
      )
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)

    if (convRows.length === 0) return []

    const conversationIds = convRows.map((r) => r.id)

    // Fan out the participant + last-message hydrations in parallel —
    // both are bounded scans on indexed columns.
    const [otherParts, latestMsgs] = await Promise.all([
      this.db
        .select({
          conversationId: conversationParticipants.conversationId,
          userId: conversationParticipants.userId,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
        })
        .from(conversationParticipants)
        .innerJoin(users, eq(users.id, conversationParticipants.userId))
        .where(
          and(
            inArray(conversationParticipants.conversationId, conversationIds),
            sql`${conversationParticipants.userId} <> ${userId}`,
          ),
        ),
      // Latest non-deleted message per conversation. Soft-deleted
      // messages keep their row for ordering but we never echo their
      // content back into the snippet.
      this.db.execute(sql`
        SELECT DISTINCT ON (conversation_id)
          conversation_id, sender_id, content, created_at
        FROM chat_messages
        WHERE conversation_id IN (${sql.join(
          conversationIds.map((id) => sql`${id}`),
          sql`, `,
        )})
          AND deleted_at IS NULL
        ORDER BY conversation_id, created_at DESC
      `),
    ])

    const partsByConv = new Map<string, ChatParticipant[]>()
    for (const p of otherParts) {
      const list = partsByConv.get(p.conversationId) ?? []
      list.push({
        id: p.userId,
        name: p.name,
        email: p.email,
        avatarUrl: p.avatarUrl,
      })
      partsByConv.set(p.conversationId, list)
    }

    const latestByConv = new Map<string, { content: string; senderId: string }>()
    for (const row of rowsOf<Record<string, unknown>>(latestMsgs)) {
      latestByConv.set(row.conversation_id as string, {
        content: row.content as string,
        senderId: row.sender_id as string,
      })
    }

    return convRows.map((r): FeedItem => {
      const isGroup = r.kind === 'group'
      const others = partsByConv.get(r.id) ?? []
      const last = latestByConv.get(r.id) ?? null
      const snippet = last ? buildSnippet(last.content) : ''
      const isMine = last && last.senderId === userId
      // Direct chat row → "<Other person's name>"; group row → group
      // title. The chip ("CHAT" vs "CHANNEL") makes the kind explicit
      // even when titles are missing.
      const displayName =
        (!isGroup ? others[0]?.name ?? others[0]?.email ?? 'Conversation' : r.title) ??
        'Conversation'
      // Mirror Pencil's "You: …" prefix for outbound previews so the
      // row reads as a snippet, not as if someone else just spoke.
      const previewedSnippet = isMine && snippet ? `You: ${snippet}` : snippet
      const activityAt = r.lastMessageAt.toISOString()

      if (isGroup) {
        return {
          kind: 'chat-group',
          tag: 'CHANNEL',
          id: r.id,
          activityAt,
          isRead: r.unreadCount === 0,
          unreadCount: r.unreadCount,
          title: r.title,
          otherParticipants: others,
          snippet: previewedSnippet,
          lastMessageAt: activityAt,
        }
      }
      return {
        kind: 'chat-direct',
        tag: 'CHAT',
        id: r.id,
        activityAt,
        isRead: r.unreadCount === 0,
        unreadCount: r.unreadCount,
        displayName,
        otherParticipants: others,
        snippet: previewedSnippet,
        lastMessageAt: activityAt,
      }
    })
  }

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------

  /// Unified search. Each enabled index is queried in parallel; we
  /// merge the hits by activityAt DESC.  When MeiliSearch isn't
  /// configured we fall back to the listing path (the user still gets
  /// chronological results — they just don't get full-text matches).
  private async searchAcross(opts: {
    userId: string
    folder: string
    kind: 'all' | 'mail' | 'chats'
    wantsMail: boolean
    wantsChats: boolean
    cursor: string | null
    limit: number
    q: string
  }): Promise<FeedListResult> {
    const { userId, wantsMail, wantsChats, cursor, limit, q } = opts
    const cursorMs = cursor ? new Date(cursor).getTime() : Number.POSITIVE_INFINITY

    // Each search returns up to `limit` hits; the merged tail picks
    // the top `limit` items overall.
    const [mailHits, chatHitsRes] = await Promise.all([
      wantsMail && searchEnabled() ? searchEmails(userId, q, 1, limit) : Promise.resolve(null),
      wantsChats && chatSearchEnabled()
        ? searchChatMessages(userId, q, 1, limit)
        : Promise.resolve(null),
    ])

    const mailItems: FeedItem[] = (mailHits?.data ?? [])
      .filter((e) => new Date(e.createdAt).getTime() < cursorMs)
      .map((e) => ({
        kind: 'email' as const,
        tag: 'MAIL' as const,
        id: e.id,
        activityAt: e.createdAt,
        isRead: e.isRead,
        isStarred: e.isStarred,
        displayName: e.fromName ?? extractDisplayLocal(e.fromAddress),
        fromAddress: e.fromAddress,
        toAddresses: e.toAddresses,
        cc: e.cc,
        subject: e.subject,
        snippet: e.snippet,
        folder: e.folder,
        isDraft: e.isDraft,
        hasAttachments: e.hasAttachments,
        sizeBytes: e.sizeBytes,
        status: e.status,
        sendError: e.sendError,
        mailboxId: e.mailboxId,
        labels: [],
        threadId: e.threadId,
      }))

    const chatItems: FeedItem[] = await this.searchHitsToFeedItems(
      userId,
      chatHitsRes?.hits ?? [],
      cursorMs,
    )

    const merged = mergeByActivity(mailItems, chatItems).slice(0, limit)
    const nextCursor =
      merged.length === limit ? merged[merged.length - 1]?.activityAt ?? null : null

    // Unread count for search results is intentionally the global
    // unread count, not "unread within these search hits" — matches
    // how Gmail / Slack behave (the badge reflects state, not query).
    const unreadCount = await this.countUnread({
      userId,
      folder: opts.folder,
      kind: opts.kind,
      wantsMail,
      wantsChats,
    })

    return { data: merged, nextCursor, unreadCount }
  }

  /// Hydrate chat search hits (one row per matched message) into
  /// FeedItem rows (one row per conversation). When two messages from
  /// the same conversation match the same query, the most recent wins
  /// — search ranks chronologically already.
  private async searchHitsToFeedItems(
    userId: string,
    hits: ChatSearchHit[],
    cursorMs: number,
  ): Promise<FeedItem[]> {
    if (hits.length === 0) return []

    // Bucket hits by conversation, keeping the newest per conversation.
    const newestByConv = new Map<string, ChatSearchHit>()
    for (const h of hits) {
      const existing = newestByConv.get(h.conversationId)
      if (!existing || new Date(h.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        newestByConv.set(h.conversationId, h)
      }
    }
    const conversationIds = [...newestByConv.keys()]
    if (conversationIds.length === 0) return []

    const convRows = await this.db
      .select({
        id: conversations.id,
        kind: conversations.kind,
        title: conversations.title,
        lastMessageAt: conversations.lastMessageAt,
        unreadCount: conversationParticipants.unreadCount,
      })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
      .where(
        and(
          eq(conversationParticipants.userId, userId),
          inArray(conversationParticipants.conversationId, conversationIds),
        ),
      )

    const otherParts = await this.db
      .select({
        conversationId: conversationParticipants.conversationId,
        userId: conversationParticipants.userId,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(
        and(
          inArray(conversationParticipants.conversationId, conversationIds),
          sql`${conversationParticipants.userId} <> ${userId}`,
        ),
      )

    const partsByConv = new Map<string, ChatParticipant[]>()
    for (const p of otherParts) {
      const list = partsByConv.get(p.conversationId) ?? []
      list.push({ id: p.userId, name: p.name, email: p.email, avatarUrl: p.avatarUrl })
      partsByConv.set(p.conversationId, list)
    }

    return convRows
      .filter((c) => c.lastMessageAt.getTime() < cursorMs)
      .map((c): FeedItem => {
        const hit = newestByConv.get(c.id)!
        const isGroup = c.kind === 'group'
        const others = partsByConv.get(c.id) ?? []
        const displayName =
          (!isGroup ? others[0]?.name ?? others[0]?.email ?? 'Conversation' : c.title) ??
          'Conversation'
        const activityAt = c.lastMessageAt.toISOString()
        const snippet = buildSnippet(hit.content)
        const previewedSnippet = hit.senderId === userId && snippet ? `You: ${snippet}` : snippet

        if (isGroup) {
          return {
            kind: 'chat-group',
            tag: 'CHANNEL',
            id: c.id,
            activityAt,
            isRead: c.unreadCount === 0,
            unreadCount: c.unreadCount,
            title: c.title,
            otherParticipants: others,
            snippet: previewedSnippet,
            lastMessageAt: activityAt,
          }
        }
        return {
          kind: 'chat-direct',
          tag: 'CHAT',
          id: c.id,
          activityAt,
          isRead: c.unreadCount === 0,
          unreadCount: c.unreadCount,
          displayName,
          otherParticipants: others,
          snippet: previewedSnippet,
          lastMessageAt: activityAt,
        }
      })
  }

  // ---------------------------------------------------------------------
  // Unread counter
  // ---------------------------------------------------------------------

  /// Global unread count for the current filter. Mail counts unread
  /// rows in the matching folder; chats count conversations whose
  /// `unread_count > 0` from this user's perspective. The two are
  /// summed when kind=all.
  private async countUnread(opts: {
    userId: string
    folder: string
    kind: 'all' | 'mail' | 'chats'
    wantsMail: boolean
    wantsChats: boolean
  }): Promise<number> {
    const { userId, folder, wantsMail, wantsChats } = opts
    let total = 0

    if (wantsMail) {
      const mailboxIds = await this.resolveMailboxIds(userId)
      if (mailboxIds.length > 0) {
        const where = this.buildFolderWhere(folder, mailboxIds, null)
        const [{ count }] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(emails)
          .where(and(where, eq(emails.isRead, false)))
        total += Number(count ?? 0)
      }
    }

    if (wantsChats) {
      const [{ count }] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.userId, userId),
            sql`${conversationParticipants.unreadCount} > 0`,
          ),
        )
      total += Number(count ?? 0)
    }

    return total
  }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/// Merge two pre-sorted (DESC) feed-item arrays into one DESC array.
/// O(n + m).  Stable on equal timestamps — the first array wins, so
/// `mergeByActivity(mail, chat)` puts mail before chat on a tie. The
/// pagination cursor uses `activityAt`, so this stability is what
/// keeps boundary rows from disappearing across pages.
function mergeByActivity(a: FeedItem[], b: FeedItem[]): FeedItem[] {
  const out: FeedItem[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i].activityAt >= b[j].activityAt) {
      out.push(a[i++])
    } else {
      out.push(b[j++])
    }
  }
  while (i < a.length) out.push(a[i++])
  while (j < b.length) out.push(b[j++])
  return out
}

/// "veda@wistmail.com" → "veda" — fallback when the RFC-5322 from-name
/// is missing.  Capitalises so the row reads as a name, not a handle.
function extractDisplayLocal(addr: string): string {
  const local = addr.split('@')[0] ?? addr
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

/// Same snippet trimming the EmailService uses.  Defined locally to
/// keep feed.ts free of cross-service imports.
function buildSnippet(textBody: string | null): string {
  if (!textBody) return ''
  const collapsed = textBody.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= PREVIEW_CHARS) return collapsed
  return `${collapsed.slice(0, PREVIEW_CHARS)}…`
}

/// Drizzle's `db.execute(sql)` returns the driver-native result —
/// `{ rows, rowCount }` on node-postgres and pglite, but a bare array
/// on some adapters. Normalise so callers always get the row array.
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (
    result &&
    typeof result === 'object' &&
    Array.isArray((result as { rows?: unknown[] }).rows)
  ) {
    return (result as { rows: T[] }).rows
  }
  return []
}
