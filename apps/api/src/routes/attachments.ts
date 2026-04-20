import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import { and, eq } from 'drizzle-orm'
import { attachments, emails, mailboxes } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'
import { openAttachmentStream } from '../lib/attachment-storage.js'

/// Mounted at /api/v1/inbox/attachments. Two endpoints:
///   - GET /:id            → metadata JSON + download URL
///   - GET /:id/download   → byte stream from filesystem storage
///
/// Both gated by sessionAuth + mailbox ownership join.
export const attachmentRoutes = new Hono<SessionEnv>()

attachmentRoutes.use('*', sessionAuth)

/// Inner helper — load + auth-check the attachment row in one go.
/// Returns null if the row doesn't exist OR the user doesn't own
/// the mailbox it belongs to (we deliberately don't distinguish so
/// we don't leak existence to unauthorized users).
async function loadAuthorized(id: string, userId: string) {
  const db = getDb()
  const rows = await db
    .select({
      id: attachments.id,
      filename: attachments.filename,
      contentType: attachments.contentType,
      sizeBytes: attachments.sizeBytes,
      emailId: attachments.emailId,
      storageKey: attachments.storageKey,
    })
    .from(attachments)
    .innerJoin(emails, eq(emails.id, attachments.emailId))
    .innerJoin(mailboxes, eq(mailboxes.id, emails.mailboxId))
    .where(and(eq(attachments.id, id), eq(mailboxes.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * GET /api/v1/inbox/attachments/:id
 * Metadata + download URL the UI links to.
 */
attachmentRoutes.get('/:id', async (c) => {
  const att = await loadAuthorized(c.req.param('id'), c.get('userId'))
  if (!att) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Attachment not found' } },
      404,
    )
  }
  return c.json({
    id: att.id,
    filename: att.filename,
    contentType: att.contentType,
    sizeBytes: att.sizeBytes,
    emailId: att.emailId,
    downloadUrl: `/api/v1/inbox/attachments/${att.id}/download`,
  })
})

/**
 * GET /api/v1/inbox/attachments/:id/download
 * Streams the attachment bytes from filesystem storage. Sets
 * Content-Disposition so the browser saves with the original
 * filename instead of "download".
 */
attachmentRoutes.get('/:id/download', async (c) => {
  const att = await loadAuthorized(c.req.param('id'), c.get('userId'))
  if (!att) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Attachment not found' } },
      404,
    )
  }

  let opened: Awaited<ReturnType<typeof openAttachmentStream>>
  try {
    opened = await openAttachmentStream(att.id)
  } catch (err) {
    console.error('[attachments] storage read failed:', err)
    // Bytes lost (orphaned row, disk corruption, etc.). 410 Gone
    // tells the caller this is permanent — retrying won't help.
    return c.json(
      {
        error: {
          code: 'GONE',
          message: 'Attachment bytes are no longer available.',
        },
      },
      410,
    )
  }

  // Force download (browser saves the file rather than rendering
  // it inline) for non-image / non-PDF types. Inline is fine for
  // browser-renderable content.
  const inlineable =
    att.contentType.startsWith('image/') ||
    att.contentType === 'application/pdf'
  const disposition = inlineable ? 'inline' : 'attachment'
  // RFC 5987 — encode the filename so non-ASCII names survive the
  // header without breaking older browsers.
  const encodedName = encodeURIComponent(att.filename).replace(/'/g, '%27')

  c.header('Content-Type', att.contentType || 'application/octet-stream')
  c.header('Content-Length', String(opened.sizeBytes))
  c.header(
    'Content-Disposition',
    `${disposition}; filename*=UTF-8''${encodedName}`,
  )
  c.header('Cache-Control', 'private, max-age=3600')

  return stream(c, async (writer) => {
    for await (const chunk of opened.stream) {
      await writer.write(chunk as Uint8Array)
    }
  })
})
