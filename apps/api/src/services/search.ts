/// MeiliSearch-backed full-text email search.
///
/// We index every received/sent email under a per-user index pattern
/// `emails-{userId}`. Search is per-user, so cross-user leakage is
/// physically impossible: each user only ever queries their own index.
///
/// On a cold deploy the index may be missing or empty — callers should
/// fall back to EmailService.search (cheap subject+from ILIKE) so the
/// app stays responsive.

import { Meilisearch } from 'meilisearch'
import type { Index } from 'meilisearch'

type MeiliSearchClient = Meilisearch
import type { EmailListItem, EmailListPage } from './email.js'

const MEILI_URL = process.env.MEILISEARCH_URL || ''
const MEILI_KEY = process.env.MEILISEARCH_API_KEY || ''

export interface IndexableEmail {
  id: string
  userId: string
  mailboxId: string
  fromAddress: string
  toAddresses: string[]
  cc: string[]
  subject: string
  textBody: string | null
  htmlBody: string | null
  folder: string
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  hasAttachments: boolean
  sizeBytes: number
  createdAtMs: number
}

interface IndexedDoc {
  id: string
  mailboxId: string
  fromAddress: string
  toAddresses: string[]
  cc: string[]
  subject: string
  body: string
  folder: string
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  hasAttachments: boolean
  sizeBytes: number
  createdAt: number
}

let client: MeiliSearchClient | null = null
const indexInitCache = new Set<string>()

function getClient(): MeiliSearchClient | null {
  if (!MEILI_URL || !MEILI_KEY) return null
  if (client) return client
  client = new Meilisearch({ host: MEILI_URL, apiKey: MEILI_KEY })
  return client
}

export function searchEnabled(): boolean {
  return getClient() !== null
}

function indexNameFor(userId: string): string {
  return `emails-${userId}`
}

/// Strip HTML tags and collapse whitespace for indexing. We don't want
/// the indexer to surface stylesheet noise as "matches".
function htmlToText(html: string | null): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

async function ensureIndex(userId: string): Promise<Index | null> {
  const c = getClient()
  if (!c) return null
  const name = indexNameFor(userId)
  const idx = c.index<IndexedDoc>(name)
  if (indexInitCache.has(name)) return idx

  // Idempotent: getOrCreateIndex pattern. We don't await the task — first
  // search will benefit from settings even if the indexing is fresh.
  try {
    await c.createIndex(name, { primaryKey: 'id' })
  } catch {
    // already exists — fine
  }
  try {
    await idx.updateSettings({
      searchableAttributes: ['subject', 'fromAddress', 'toAddresses', 'cc', 'body'],
      filterableAttributes: ['folder', 'isRead', 'isStarred', 'mailboxId'],
      sortableAttributes: ['createdAt'],
      rankingRules: [
        'words',
        'typo',
        'proximity',
        'attribute',
        'sort',
        'exactness',
      ],
    })
  } catch (err) {
    console.error('[search] settings update failed:', err)
  }
  indexInitCache.add(name)
  return idx
}

function toDoc(input: IndexableEmail): IndexedDoc {
  return {
    id: input.id,
    mailboxId: input.mailboxId,
    fromAddress: input.fromAddress,
    toAddresses: input.toAddresses,
    cc: input.cc,
    subject: input.subject,
    body: input.textBody ?? htmlToText(input.htmlBody),
    folder: input.folder,
    isRead: input.isRead,
    isStarred: input.isStarred,
    isDraft: input.isDraft,
    hasAttachments: input.hasAttachments,
    sizeBytes: input.sizeBytes,
    createdAt: input.createdAtMs,
  }
}

export async function indexEmail(input: IndexableEmail): Promise<void> {
  const idx = await ensureIndex(input.userId)
  if (!idx) return
  await idx.addDocuments([toDoc(input)], { primaryKey: 'id' })
}

export async function indexEmails(inputs: IndexableEmail[]): Promise<void> {
  // Group by user since every doc lives in its own per-user index.
  const byUser = new Map<string, IndexableEmail[]>()
  for (const e of inputs) {
    const list = byUser.get(e.userId) ?? []
    list.push(e)
    byUser.set(e.userId, list)
  }
  await Promise.all(
    Array.from(byUser.entries()).map(async ([userId, emails]) => {
      const idx = await ensureIndex(userId)
      if (!idx) return
      await idx.addDocuments(emails.map(toDoc), { primaryKey: 'id' })
    }),
  )
}

export async function deleteIndexedEmail(userId: string, emailId: string): Promise<void> {
  const idx = await ensureIndex(userId)
  if (!idx) return
  try {
    await idx.deleteDocument(emailId)
  } catch (err) {
    // Missing doc isn't fatal.
    console.error('[search] delete failed:', err)
  }
}

export async function updateIndexedEmail(
  userId: string,
  emailId: string,
  changes: Partial<Pick<IndexedDoc, 'isRead' | 'isStarred' | 'folder'>>,
): Promise<void> {
  const idx = await ensureIndex(userId)
  if (!idx) return
  try {
    await idx.updateDocuments([{ id: emailId, ...changes }] as IndexedDoc[])
  } catch (err) {
    console.error('[search] update failed:', err)
  }
}

export async function searchEmails(
  userId: string,
  query: string,
  page = 1,
  pageSize = 25,
): Promise<EmailListPage | null> {
  const idx = await ensureIndex(userId)
  if (!idx) return null

  const offset = (page - 1) * pageSize
  const trimmed = query.trim()
  if (!trimmed) {
    return { data: [], total: 0, page, pageSize, hasMore: false }
  }

  try {
    const res = await idx.search(trimmed, {
      offset,
      limit: pageSize,
      attributesToRetrieve: [
        'id',
        'mailboxId',
        'fromAddress',
        'toAddresses',
        'cc',
        'subject',
        'body',
        'folder',
        'isRead',
        'isStarred',
        'isDraft',
        'hasAttachments',
        'sizeBytes',
        'createdAt',
      ],
      sort: ['createdAt:desc'],
    })

    const data: EmailListItem[] = (res.hits as IndexedDoc[]).map((h) => ({
      id: h.id,
      mailboxId: h.mailboxId,
      fromAddress: h.fromAddress,
      toAddresses: h.toAddresses ?? [],
      cc: h.cc ?? [],
      subject: h.subject ?? '',
      snippet:
        (h.body ?? '').length > 200
          ? `${(h.body ?? '').slice(0, 200)}…`
          : h.body ?? '',
      folder: h.folder,
      isRead: h.isRead,
      isStarred: h.isStarred,
      isDraft: h.isDraft,
      hasAttachments: h.hasAttachments,
      sizeBytes: h.sizeBytes,
      // Search hits don't carry send-state metadata. Default to 'idle'
      // — the row will reconcile with its true status the next time
      // the inbox list streams.
      status: 'idle',
      sendError: null,
      updatedAt: new Date(h.createdAt).toISOString(),
      createdAt: new Date(h.createdAt).toISOString(),
    }))

    const total =
      typeof res.estimatedTotalHits === 'number' ? res.estimatedTotalHits : data.length
    return {
      data,
      total,
      page,
      pageSize,
      hasMore: offset + data.length < total,
    }
  } catch (err) {
    console.error('[search] meilisearch query failed:', err)
    return null
  }
}
