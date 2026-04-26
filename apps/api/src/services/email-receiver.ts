import { eq } from 'drizzle-orm'
import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser'
import { attachments as attachmentsTable, emails, mailboxes, domains } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'
import { eventBus } from '../events/bus.js'
import {
  newAttachmentId,
  putAttachment,
} from '../lib/attachment-storage.js'
import { enqueueIngestEmail } from '../lib/ai-queue.js'
import { publishBust } from '../lib/cache-bus.js'
import { sendEmailNotification } from './fcm.js'
import { indexEmail } from './search.js'
import { ThreadService } from './thread-service.js'

interface InboundEmail {
  from: string
  to: string[]
  rawData: string
}

/// Narrow projection of mailparser's `ParsedMail` with the fields we
/// actually consume. Keeps call sites from reaching into the full
/// mailparser type (which carries a ton of metadata we don't need)
/// and makes it obvious what the downstream insert depends on.
interface NormalisedEmail {
  messageId: string
  from: string
  /// Display name from the RFC-5322 From header. `null` when the
  /// sender's MTA didn't set one (most automated bots, basic SMTP
  /// scripts). Mobile UI prefers this over the bare address when set.
  fromName: string | null
  to: string[]
  cc: string[]
  subject: string
  textBody: string | null
  htmlBody: string | null
  date: Date
  inReplyTo: string | null
  references: string[]
  headers: Record<string, string>
  attachments: NormalisedAttachment[]
}

interface NormalisedAttachment {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  content: Buffer
  cid: string | null
}

/**
 * EmailReceiver processes inbound emails from the SMTP server.
 * Parses the raw MIME data with mailparser (single pass — the old
 * hand-rolled parser was deleted when we added attachment support
 * because running both was 2× the allocations on large messages)
 * and stores it in the database.
 */
export class EmailReceiver {
  constructor(private db: Database) {}

  /**
   * Process an inbound email received from the SMTP server.
   */
  async processInbound(inbound: InboundEmail): Promise<{ stored: boolean; emailId?: string; error?: string }> {
    // Single parse. Fails closed: if mailparser can't cope we bail
    // out of the whole message rather than storing a half-parsed
    // row. Hand-rolled parser used to catch some of these but the
    // correctness tradeoffs (bad multipart boundaries, corrupt
    // encodings silently kept) were worse than a bounce.
    let parsed: NormalisedEmail
    try {
      parsed = await this.parseWithMailparser(inbound)
    } catch (err) {
      console.error('[email-receiver] mailparser failed:', err)
      return { stored: false, error: 'parse failed' }
    }

    // Find the matching mailbox for each recipient. First match
    // wins: if the same message is addressed to two of the user's
    // aliases, it lands in the first mailbox we resolve. We don't
    // multiply the row across mailboxes because the thread would
    // then fan out twice in every folder — one message, multiple
    // copies — which is a worse UX than having the user search
    // by original recipient.
    for (const recipientAddr of inbound.to) {
      const localPart = recipientAddr.split('@')[0]
      const domainPart = recipientAddr.split('@')[1]

      if (!localPart || !domainPart) continue

      const mailboxResult = await this.db
        .select()
        .from(mailboxes)
        .where(eq(mailboxes.address, recipientAddr.toLowerCase()))
        .limit(1)

      if (mailboxResult.length === 0) {
        // No mailbox for this recipient — check if domain is ours
        const domainResult = await this.db
          .select()
          .from(domains)
          .where(eq(domains.name, domainPart.toLowerCase()))
          .limit(1)

        if (domainResult.length === 0) continue // Not our domain
        continue // Our domain but no mailbox
      }

      const mailbox = mailboxResult[0]

      // Store the email
      const emailId = generateId('eml')
      const subject = parsed.subject || '(no subject)'
      const fromAddress = parsed.from || inbound.from
      const fromName = parsed.fromName
      const createdAt = parsed.date || new Date()

      // Persist attachment bytes to disk before we insert the email
      // row — if the disk write fails we don't want a row pointing
      // at nothing. Any individual failure is logged and skipped;
      // the rest of the message still lands.
      const persistedAttachments = await this.persistAttachments(
        parsed.attachments,
      )

      // Resolve (or create) the thread this message belongs to.
      // Done before the insert so the email row carries thread_id
      // from the start rather than needing a follow-up UPDATE.
      //
      // Defensive: a bug in threading must NEVER cost us the inbound
      // email. If assignThread throws for any reason (broken query,
      // FK violation, unexpected input shape), we log it and fall
      // back to `threadId = null` — the message still lands in the
      // inbox as its own single-message thread, and the backfill
      // endpoint can stitch it into the right conversation later.
      const threads = new ThreadService(this.db)
      let threadId: string | null = null
      try {
        threadId = await threads.assignThread({
          mailboxId: mailbox.id,
          subject,
          fromAddress,
          toAddresses: parsed.to.length > 0 ? parsed.to : inbound.to,
          cc: parsed.cc,
          inReplyTo: parsed.inReplyTo,
          references: parsed.references,
          createdAt,
        })
      } catch (err) {
        console.error(
          '[email-receiver] threading failed — storing as singleton:',
          err,
        )
      }

      await this.db.insert(emails).values({
        id: emailId,
        messageId: parsed.messageId || `${emailId}@inbound`,
        fromAddress,
        fromName,
        toAddresses: parsed.to.length > 0 ? parsed.to : inbound.to,
        cc: parsed.cc,
        subject,
        textBody: parsed.textBody,
        htmlBody: parsed.htmlBody,
        mailboxId: mailbox.id,
        folder: 'inbox',
        isRead: false,
        isDraft: false,
        isStarred: false,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        headers: parsed.headers,
        sizeBytes: inbound.rawData.length,
        createdAt,
        threadId,
      })

      if (persistedAttachments.length > 0) {
        await this.db.insert(attachmentsTable).values(
          persistedAttachments.map((a) => ({
            id: a.id,
            emailId,
            filename: a.filename,
            contentType: a.contentType,
            contentId: a.cid,
            sizeBytes: a.sizeBytes,
            storageKey: a.storageKey,
          })),
        )
      }

      const snippet = (parsed.textBody ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
      const preview = snippet.slice(0, 140)
      const hasAttachments = persistedAttachments.length > 0

      // Carry the full slim list-row payload so subscribers (web/mobile)
      // can render the new inbox row without a follow-up fetch.
      eventBus.publish({
        type: 'email.new',
        userId: mailbox.userId,
        emailId,
        mailboxId: mailbox.id,
        folder: 'inbox',
        fromAddress,
        fromName,
        toAddresses: parsed.to.length > 0 ? parsed.to : inbound.to,
        cc: parsed.cc,
        subject,
        snippet,
        isRead: false,
        isStarred: false,
        isDraft: false,
        hasAttachments,
        sizeBytes: inbound.rawData.length,
        createdAt: createdAt.toISOString(),
        preview,
      })

      // Enqueue AI fan-out (classify, summarize, auto-label, draft).
      // Fire-and-forget; the worker is decoupled from the SMTP path.
      enqueueIngestEmail(emailId).catch((err) => {
        console.warn('[email-receiver] AI enqueue failed:', err)
      })

      // New email invalidates the user's hot reads (today / unified-inbox).
      publishBust(mailbox.userId).catch(() => {})

      // Index in MeiliSearch (fire-and-forget; no-op if disabled)
      indexEmail({
        id: emailId,
        userId: mailbox.userId,
        mailboxId: mailbox.id,
        fromAddress,
        toAddresses: parsed.to.length > 0 ? parsed.to : inbound.to,
        cc: parsed.cc,
        subject,
        textBody: parsed.textBody,
        htmlBody: parsed.htmlBody,
        folder: 'inbox',
        isRead: false,
        isStarred: false,
        isDraft: false,
        hasAttachments,
        sizeBytes: inbound.rawData.length,
        createdAtMs: createdAt.getTime(),
      }).catch((err) => console.error('[email-receiver] indexEmail failed:', err))

      // Push notification (fire-and-forget; no-op if FCM not configured)
      sendEmailNotification({
        userId: mailbox.userId,
        emailId,
        fromAddress,
        subject,
        preview,
      }).catch((err) => {
        console.error('[email-receiver] FCM push failed:', err)
      })

      return { stored: true, emailId }
    }

    return { stored: false, error: 'No matching mailbox found' }
  }

  /// Run mailparser once and normalise the result into the slimmer
  /// shape the rest of the pipeline expects. Every downstream
  /// consumer (DB insert, search indexer, FCM push) reads from the
  /// same `NormalisedEmail` so there's one source of truth for what
  /// "the inbound message looked like".
  private async parseWithMailparser(
    inbound: InboundEmail,
  ): Promise<NormalisedEmail> {
    const parsed: ParsedMail = await simpleParser(inbound.rawData, {
      skipHtmlToText: true, // we index text/html separately
      skipTextLinks: true,
    })

    const addresses = (a: AddressObject | AddressObject[] | undefined): string[] => {
      if (!a) return []
      const list = Array.isArray(a) ? a : [a]
      return list
        .flatMap((one) => one.value.map((v) => v.address?.toLowerCase().trim()))
        .filter((x): x is string => !!x)
    }

    const headers: Record<string, string> = {}
    for (const [k, v] of parsed.headers) {
      // mailparser stores Map values as strings or structured objects
      // depending on header; coerce to a plain string so the `emails`
      // jsonb column has a predictable shape.
      headers[k] = typeof v === 'string' ? v : String(v)
    }

    const inReplyTo =
      typeof parsed.inReplyTo === 'string'
        ? parsed.inReplyTo.replace(/[<>]/g, '')
        : null
    const references: string[] = Array.isArray(parsed.references)
      ? parsed.references.map((r) => r.replace(/[<>]/g, ''))
      : parsed.references
        ? [parsed.references.replace(/[<>]/g, '')]
        : []

    const inboundAttachments: NormalisedAttachment[] = (parsed.attachments ?? [])
      .filter((a) => a.size > 0 && !!a.content)
      .map((a) => ({
        id: newAttachmentId(),
        filename:
          a.filename ||
          (a.contentId ? a.contentId.replace(/[<>]/g, '') : 'attachment'),
        contentType: a.contentType || 'application/octet-stream',
        sizeBytes: a.size,
        content: a.content,
        cid: a.contentId ? a.contentId.replace(/[<>]/g, '') : null,
      }))

    const fromAddr = parsed.from?.value[0]?.address?.toLowerCase() ?? ''
    const fromNameRaw = parsed.from?.value[0]?.name?.trim() ?? ''
    // Reject names that are just the email echoed back (some MTAs
    // do this when the user hasn't set a real display name). No
    // value over the bare address.
    const fromName =
      fromNameRaw.length > 0 && fromNameRaw.toLowerCase() !== fromAddr
        ? fromNameRaw.slice(0, 255)
        : null

    return {
      messageId: (parsed.messageId ?? '').replace(/[<>]/g, ''),
      from: fromAddr,
      fromName,
      to: addresses(parsed.to),
      cc: addresses(parsed.cc),
      subject: parsed.subject ?? '',
      textBody: parsed.text ?? null,
      htmlBody: parsed.html === false ? null : parsed.html ?? null,
      date: parsed.date ?? new Date(),
      inReplyTo,
      references,
      headers,
      attachments: inboundAttachments,
    }
  }

  /// Write each attachment's bytes to filesystem storage and return
  /// the rows the caller will insert into `attachments`. Failures
  /// here don't abort the email — we log and continue with whatever
  /// attachments DID succeed (better to deliver the message with a
  /// missing PDF than not at all).
  private async persistAttachments(
    atts: NormalisedAttachment[],
  ): Promise<
    Array<{
      id: string
      filename: string
      contentType: string
      sizeBytes: number
      storageKey: string
      cid: string | null
    }>
  > {
    const out: Array<{
      id: string
      filename: string
      contentType: string
      sizeBytes: number
      storageKey: string
      cid: string | null
    }> = []
    for (const att of atts) {
      try {
        const storageKey = await putAttachment(att.id, att.content)
        out.push({
          id: att.id,
          filename: att.filename,
          contentType: att.contentType,
          sizeBytes: att.sizeBytes,
          storageKey,
          cid: att.cid,
        })
      } catch (err) {
        console.error(
          `[email-receiver] failed to store attachment ${att.id}:`,
          err,
        )
      }
    }
    return out
  }
}
