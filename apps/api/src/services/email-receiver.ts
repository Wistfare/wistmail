import { eq } from 'drizzle-orm'
import { emails, mailboxes, domains } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

interface InboundEmail {
  from: string
  to: string[]
  rawData: string
}

interface ParsedEmail {
  messageId: string
  from: string
  to: string[]
  cc: string[]
  subject: string
  textBody: string | null
  htmlBody: string | null
  date: Date
  inReplyTo: string | null
  references: string[]
  headers: Record<string, string>
}

/**
 * EmailReceiver processes inbound emails from the SMTP server.
 * Parses the raw MIME data and stores it in the database.
 */
export class EmailReceiver {
  constructor(private db: Database) {}

  /**
   * Process an inbound email received from the SMTP server.
   */
  async processInbound(inbound: InboundEmail): Promise<{ stored: boolean; emailId?: string; error?: string }> {
    // Parse the raw MIME message
    const parsed = this.parseRawEmail(inbound.rawData)

    // Find the matching mailbox for each recipient
    for (const recipientAddr of inbound.to) {
      const localPart = recipientAddr.split('@')[0]
      const domainPart = recipientAddr.split('@')[1]

      if (!localPart || !domainPart) continue

      // Find mailbox matching this address
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
      await this.db.insert(emails).values({
        id: emailId,
        messageId: parsed.messageId || `${emailId}@inbound`,
        fromAddress: parsed.from || inbound.from,
        toAddresses: parsed.to.length > 0 ? parsed.to : inbound.to,
        cc: parsed.cc,
        subject: parsed.subject || '(no subject)',
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
        createdAt: parsed.date || new Date(),
      })

      return { stored: true, emailId }
    }

    return { stored: false, error: 'No matching mailbox found' }
  }

  /**
   * Parse a raw RFC 5322 email message into structured data.
   */
  private parseRawEmail(raw: string): ParsedEmail {
    const result: ParsedEmail = {
      messageId: '',
      from: '',
      to: [],
      cc: [],
      subject: '',
      textBody: null,
      htmlBody: null,
      date: new Date(),
      inReplyTo: null,
      references: [],
      headers: {},
    }

    // Split headers and body
    const headerBodySplit = raw.indexOf('\r\n\r\n')
    const headerSection = headerBodySplit > 0 ? raw.substring(0, headerBodySplit) : raw
    const bodySection = headerBodySplit > 0 ? raw.substring(headerBodySplit + 4) : ''

    // Parse headers (handle folded headers)
    const unfoldedHeaders = headerSection.replace(/\r\n[ \t]+/g, ' ')
    const headerLines = unfoldedHeaders.split('\r\n')

    for (const line of headerLines) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const name = line.substring(0, colonIdx).trim().toLowerCase()
      const value = line.substring(colonIdx + 1).trim()

      result.headers[name] = value

      switch (name) {
        case 'message-id':
          result.messageId = value.replace(/[<>]/g, '')
          break
        case 'from':
          result.from = this.extractEmailAddress(value)
          break
        case 'to':
          result.to = this.extractEmailAddresses(value)
          break
        case 'cc':
          result.cc = this.extractEmailAddresses(value)
          break
        case 'subject':
          result.subject = this.decodeSubject(value)
          break
        case 'date':
          try {
            result.date = new Date(value)
          } catch {
            result.date = new Date()
          }
          break
        case 'in-reply-to':
          result.inReplyTo = value.replace(/[<>]/g, '')
          break
        case 'references':
          result.references = value
            .split(/\s+/)
            .map((r) => r.replace(/[<>]/g, ''))
            .filter(Boolean)
          break
      }
    }

    // Parse body based on content type
    const contentType = result.headers['content-type'] || 'text/plain'

    if (contentType.includes('multipart/')) {
      // Extract boundary
      const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/)
      if (boundaryMatch) {
        const boundary = boundaryMatch[1]
        this.parseMultipart(bodySection, boundary, result)
      }
    } else if (contentType.includes('text/html')) {
      result.htmlBody = bodySection
    } else {
      result.textBody = bodySection
    }

    return result
  }

  /**
   * Parse multipart MIME body.
   */
  private parseMultipart(body: string, boundary: string, result: ParsedEmail): void {
    const parts = body.split(`--${boundary}`)

    for (const part of parts) {
      if (part.startsWith('--') || part.trim() === '') continue

      const partHeaderEnd = part.indexOf('\r\n\r\n')
      if (partHeaderEnd === -1) continue

      const partHeaders = part.substring(0, partHeaderEnd).toLowerCase()
      const partBody = part.substring(partHeaderEnd + 4).replace(/\r\n$/, '')

      if (partHeaders.includes('multipart/')) {
        // Nested multipart
        const nestedBoundaryMatch = partHeaders.match(/boundary="?([^";\s]+)"?/)
        if (nestedBoundaryMatch) {
          this.parseMultipart(partBody, nestedBoundaryMatch[1], result)
        }
      } else if (partHeaders.includes('text/html')) {
        result.htmlBody = partBody
      } else if (partHeaders.includes('text/plain')) {
        result.textBody = partBody
      }
    }
  }

  private extractEmailAddress(value: string): string {
    const match = value.match(/<([^>]+)>/)
    if (match) return match[1].toLowerCase()
    return value.trim().toLowerCase()
  }

  private extractEmailAddresses(value: string): string[] {
    return value
      .split(',')
      .map((addr) => this.extractEmailAddress(addr))
      .filter(Boolean)
  }

  private decodeSubject(value: string): string {
    // Decode RFC 2047 encoded words (basic implementation)
    return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, (_match, _charset, encoding, text) => {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf-8')
      }
      // Q encoding
      return text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    })
  }
}
