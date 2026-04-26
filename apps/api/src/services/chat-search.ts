/// MeiliSearch-backed full-text chat search. Mirrors the pattern in
/// `search.ts` (email): one index per user, name `chat-{userId}`. We
/// index every message the user has access to (via membership in the
/// conversation). On a cold deploy the index may be missing or empty
/// — callers should fall back gracefully (or just return an empty
/// page) so the app stays responsive.

import { Meilisearch } from 'meilisearch'
import type { Index } from 'meilisearch'

type MeiliSearchClient = Meilisearch

const MEILI_URL = process.env.MEILISEARCH_URL || ''
const MEILI_KEY = process.env.MEILISEARCH_API_KEY || ''

export interface IndexableChatMessage {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  /// Owners of this index doc. We index ONE doc per (message, member)
  /// pair so a member leaving the group can have their entries dropped
  /// without having to re-shape the doc. The doc id is `${messageId}:${userId}`.
  ownerId: string
  content: string
  createdAtMs: number
  conversationTitle: string | null
}

interface IndexedChatDoc {
  id: string
  messageId: string
  conversationId: string
  conversationTitle: string | null
  senderId: string
  senderName: string
  content: string
  createdAt: number
}

export interface ChatSearchHit {
  messageId: string
  conversationId: string
  conversationTitle: string | null
  senderId: string
  senderName: string
  content: string
  createdAt: string
}

let client: MeiliSearchClient | null = null
const indexInitCache = new Set<string>()

function getClient(): MeiliSearchClient | null {
  if (!MEILI_URL || !MEILI_KEY) return null
  if (client) return client
  client = new Meilisearch({ host: MEILI_URL, apiKey: MEILI_KEY })
  return client
}

export function chatSearchEnabled(): boolean {
  return getClient() !== null
}

function indexNameFor(userId: string): string {
  return `chat-${userId}`
}

async function ensureIndex(userId: string): Promise<Index | null> {
  const c = getClient()
  if (!c) return null
  const name = indexNameFor(userId)
  const idx = c.index<IndexedChatDoc>(name)
  if (indexInitCache.has(name)) return idx

  try {
    await c.createIndex(name, { primaryKey: 'id' })
  } catch {
    // already exists — fine
  }
  try {
    await idx.updateSettings({
      searchableAttributes: ['content', 'senderName', 'conversationTitle'],
      filterableAttributes: ['conversationId', 'senderId'],
      sortableAttributes: ['createdAt'],
      rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
    })
  } catch (err) {
    console.error('[chat-search] settings update failed:', err)
  }
  indexInitCache.add(name)
  return idx
}

function docIdFor(messageId: string, ownerId: string): string {
  return `${messageId}:${ownerId}`
}

function toDoc(input: IndexableChatMessage): IndexedChatDoc {
  return {
    id: docIdFor(input.id, input.ownerId),
    messageId: input.id,
    conversationId: input.conversationId,
    conversationTitle: input.conversationTitle,
    senderId: input.senderId,
    senderName: input.senderName,
    content: input.content,
    createdAt: input.createdAtMs,
  }
}

/// Index a single message under each owning member's index. Caller
/// supplies the list of `ownerIds` (typically the conversation's
/// participants, including the sender).
export async function indexChatMessage(
  message: Omit<IndexableChatMessage, 'ownerId'>,
  ownerIds: string[],
): Promise<void> {
  await Promise.all(
    ownerIds.map(async (ownerId) => {
      const idx = await ensureIndex(ownerId)
      if (!idx) return
      try {
        await idx.addDocuments([toDoc({ ...message, ownerId })], {
          primaryKey: 'id',
        })
      } catch (err) {
        console.error('[chat-search] index failed:', err)
      }
    }),
  )
}

/// Patch an existing message's content (after an edit). Iterates
/// every owner index — same fan-out as `indexChatMessage` above.
export async function updateIndexedChatMessage(
  messageId: string,
  ownerIds: string[],
  changes: { content: string },
): Promise<void> {
  await Promise.all(
    ownerIds.map(async (ownerId) => {
      const idx = await ensureIndex(ownerId)
      if (!idx) return
      try {
        await idx.updateDocuments(
          [{ id: docIdFor(messageId, ownerId), ...changes }] as IndexedChatDoc[],
        )
      } catch (err) {
        console.error('[chat-search] update failed:', err)
      }
    }),
  )
}

/// Drop a message from every owner's index (delete from chat or
/// soft-delete — both should hide the message from search).
export async function deleteIndexedChatMessage(
  messageId: string,
  ownerIds: string[],
): Promise<void> {
  await Promise.all(
    ownerIds.map(async (ownerId) => {
      const idx = await ensureIndex(ownerId)
      if (!idx) return
      try {
        await idx.deleteDocument(docIdFor(messageId, ownerId))
      } catch (err) {
        console.error('[chat-search] delete failed:', err)
      }
    }),
  )
}

/// Search the requesting user's chat index. Returns `null` if search
/// isn't enabled (no MEILI configured) so callers can render a gentle
/// "search not available" rather than an error.
export async function searchChatMessages(
  userId: string,
  query: string,
  page = 1,
  pageSize = 25,
): Promise<{ hits: ChatSearchHit[]; total: number; page: number; pageSize: number } | null> {
  const idx = await ensureIndex(userId)
  if (!idx) return null
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return { hits: [], total: 0, page, pageSize }
  }
  try {
    const res = await idx.search<IndexedChatDoc>(trimmed, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      sort: ['createdAt:desc'],
    })
    return {
      hits: res.hits.map((d) => ({
        messageId: d.messageId,
        conversationId: d.conversationId,
        conversationTitle: d.conversationTitle,
        senderId: d.senderId,
        senderName: d.senderName,
        content: d.content,
        createdAt: new Date(d.createdAt).toISOString(),
      })),
      total: res.estimatedTotalHits ?? res.hits.length,
      page,
      pageSize,
    }
  } catch (err) {
    console.error('[chat-search] search failed:', err)
    return null
  }
}
