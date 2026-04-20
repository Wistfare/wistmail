import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { attachments, emails, mailboxes } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

/// Mounted at /api/v1/inbox/attachments. The metadata endpoint
/// returns the row + a download URL the UI can link to. The download
/// endpoint streams bytes from object storage; right now it stubs out
/// with 501 because MIME extraction in the mail-engine isn't wired
/// yet — the row exists in the DB but the bytes haven't been
/// persisted. Wiring MinIO + MIME extraction is a separate effort;
/// this endpoint reserves the URL shape so the chips on web/mobile
/// link consistently once it lands.
export const attachmentRoutes = new Hono<SessionEnv>()

attachmentRoutes.use('*', sessionAuth)

/**
 * GET /api/v1/inbox/attachments/:id
 * Returns metadata + a download URL. Auth: session must own the
 * mailbox the attachment lives in.
 */
attachmentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
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

  if (rows.length === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Attachment not found' } },
      404,
    )
  }

  const att = rows[0]
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
 * Streams the attachment bytes. Stubs 501 until the mail-engine
 * extracts MIME parts and uploads them to object storage; the
 * `storage_key` column on `attachments` is the eventual S3/MinIO key.
 */
attachmentRoutes.get('/:id/download', async (c) => {
  return c.json(
    {
      error: {
        code: 'NOT_IMPLEMENTED',
        message:
          'Attachment downloads aren\'t wired yet — the mail engine needs to extract MIME parts and upload them to object storage.',
      },
    },
    501,
  )
})
