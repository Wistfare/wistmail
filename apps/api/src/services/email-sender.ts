import { createSign } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { domains, emails, sendingLogs, mailboxes } from '@wistmail/db'
import { generateId, DKIM_SELECTOR } from '@wistmail/shared'
import type { Database } from '@wistmail/db'
import * as net from 'node:net'
import * as dns from 'node:dns/promises'

/**
 * EmailSender handles the actual SMTP delivery of emails.
 * It builds MIME messages, signs with DKIM, and sends via SMTP to recipient mail servers.
 */
export class EmailSender {
  constructor(private db: Database) {}

  /**
   * Send an email by its ID. Builds MIME, signs DKIM, delivers via SMTP.
   */
  async sendEmail(emailId: string): Promise<{ success: boolean; error?: string }> {
    // Fetch the email
    const emailResult = await this.db.select().from(emails).where(eq(emails.id, emailId)).limit(1)
    if (emailResult.length === 0) {
      return { success: false, error: 'Email not found' }
    }
    const email = emailResult[0]

    // Get the domain's DKIM key for signing
    const mailboxResult = await this.db.select().from(mailboxes).where(eq(mailboxes.id, email.mailboxId)).limit(1)
    if (mailboxResult.length === 0) {
      return { success: false, error: 'Mailbox not found' }
    }

    const domainResult = await this.db.select().from(domains).where(eq(domains.id, mailboxResult[0].domainId)).limit(1)
    const domain = domainResult.length > 0 ? domainResult[0] : null

    // Build the MIME message
    const mimeMessage = this.buildMimeMessage(email)

    // Sign with DKIM if we have the private key
    let signedMessage = mimeMessage
    if (domain?.dkimPrivateKey) {
      try {
        signedMessage = this.signDkim(mimeMessage, domain.name, DKIM_SELECTOR, domain.dkimPrivateKey)
      } catch (err) {
        console.error('DKIM signing failed, sending unsigned:', err)
      }
    }

    // Collect all recipients
    const allRecipients = [
      ...email.toAddresses,
      ...(email.cc || []),
      ...(email.bcc || []),
    ]

    // Group by domain and send
    const domainRecipients = new Map<string, string[]>()
    for (const addr of allRecipients) {
      const recipientDomain = addr.split('@')[1]
      if (!recipientDomain) continue
      const existing = domainRecipients.get(recipientDomain) || []
      existing.push(addr)
      domainRecipients.set(recipientDomain, existing)
    }

    let lastError: string | undefined
    for (const [recipientDomain, recipients] of domainRecipients) {
      try {
        await this.sendToSmtp(email.fromAddress, recipients, signedMessage, recipientDomain)
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.error(`Failed to send to ${recipientDomain}:`, lastError)
      }
    }

    // Create sending log
    const logId = generateId('slog')
    await this.db.insert(sendingLogs).values({
      id: logId,
      emailId,
      status: lastError ? 'failed' : 'sent',
      metadata: lastError ? { error: lastError } : {},
      createdAt: new Date(),
    })

    // Update email folder
    if (!lastError) {
      await this.db
        .update(emails)
        .set({ folder: 'sent', isDraft: false })
        .where(eq(emails.id, emailId))
    }

    return lastError ? { success: false, error: lastError } : { success: true }
  }

  /**
   * Build an RFC 5322 MIME message from email data.
   */
  private buildMimeMessage(email: {
    messageId: string
    fromAddress: string
    toAddresses: string[]
    cc: string[] | null
    bcc: string[] | null
    subject: string
    textBody: string | null
    htmlBody: string | null
    inReplyTo: string | null
    references: string[] | null
  }): string {
    const lines: string[] = []
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`

    lines.push(`Message-ID: <${email.messageId}>`)
    lines.push(`Date: ${new Date().toUTCString()}`)
    lines.push(`From: ${email.fromAddress}`)
    lines.push(`To: ${email.toAddresses.join(', ')}`)

    if (email.cc && email.cc.length > 0) {
      lines.push(`Cc: ${email.cc.join(', ')}`)
    }

    lines.push(`Subject: ${email.subject}`)
    lines.push('MIME-Version: 1.0')

    if (email.inReplyTo) {
      lines.push(`In-Reply-To: <${email.inReplyTo}>`)
    }
    if (email.references && email.references.length > 0) {
      lines.push(`References: ${email.references.map((r) => `<${r}>`).join(' ')}`)
    }

    const hasText = !!email.textBody
    const hasHtml = !!email.htmlBody

    if (hasText && hasHtml) {
      lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
      lines.push('')
      lines.push(`--${boundary}`)
      lines.push('Content-Type: text/plain; charset=utf-8')
      lines.push('Content-Transfer-Encoding: 7bit')
      lines.push('')
      lines.push(email.textBody!)
      lines.push(`--${boundary}`)
      lines.push('Content-Type: text/html; charset=utf-8')
      lines.push('Content-Transfer-Encoding: 7bit')
      lines.push('')
      lines.push(email.htmlBody!)
      lines.push(`--${boundary}--`)
    } else if (hasHtml) {
      lines.push('Content-Type: text/html; charset=utf-8')
      lines.push('Content-Transfer-Encoding: 7bit')
      lines.push('')
      lines.push(email.htmlBody!)
    } else {
      lines.push('Content-Type: text/plain; charset=utf-8')
      lines.push('Content-Transfer-Encoding: 7bit')
      lines.push('')
      lines.push(email.textBody || '')
    }

    return lines.join('\r\n')
  }

  /**
   * Sign the email with DKIM (simplified RSA-SHA256 signing).
   */
  private signDkim(message: string, domain: string, selector: string, privateKeyPem: string): string {
    const headerEnd = message.indexOf('\r\n\r\n')
    const headers = message.substring(0, headerEnd)
    const body = message.substring(headerEnd + 4)

    // Hash the body
    const bodyHash = require('node:crypto').createHash('sha256').update(body).digest('base64')

    // Build DKIM header value (without signature)
    const timestamp = Math.floor(Date.now() / 1000)
    const dkimFields = [
      `v=1`,
      `a=rsa-sha256`,
      `c=relaxed/relaxed`,
      `d=${domain}`,
      `s=${selector}`,
      `t=${timestamp}`,
      `bh=${bodyHash}`,
      `h=from:to:subject:date:message-id`,
      `b=`,
    ]
    const dkimHeaderValue = dkimFields.join('; ')
    const dkimHeader = `DKIM-Signature: ${dkimHeaderValue}`

    // Sign the headers + DKIM header
    const signedHeaders = `${headers}\r\n${dkimHeader}`
    const signer = createSign('RSA-SHA256')
    signer.update(signedHeaders)
    const signature = signer.sign(privateKeyPem, 'base64')

    // Insert DKIM header at the top of the message
    const fullDkimHeader = `DKIM-Signature: ${dkimFields.slice(0, -1).join('; ')}; b=${signature}`
    return `${fullDkimHeader}\r\n${message}`
  }

  /**
   * Send raw email data via SMTP to the recipient's mail server.
   */
  private async sendToSmtp(
    from: string,
    to: string[],
    data: string,
    recipientDomain: string,
  ): Promise<void> {
    // Look up MX records
    let mxHosts: string[]
    try {
      const mxRecords = await dns.resolveMx(recipientDomain)
      mxRecords.sort((a, b) => a.priority - b.priority)
      mxHosts = mxRecords.map((r) => r.exchange.replace(/\.$/, ''))
    } catch {
      // Fallback to domain itself
      mxHosts = [recipientDomain]
    }

    let lastError: Error | undefined
    for (const host of mxHosts) {
      try {
        await this.smtpSend(host, from, to, data)
        return // Success
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        continue
      }
    }

    throw lastError || new Error(`All MX hosts failed for ${recipientDomain}`)
  }

  /**
   * Low-level SMTP send to a specific host.
   */
  private smtpSend(host: string, from: string, to: string[], data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port: 25, timeout: 30000 })
      let buffer = ''
      let step = 'connect'

      const send = (cmd: string) => {
        socket.write(cmd + '\r\n')
      }

      const processResponse = (response: string) => {
        const code = parseInt(response.substring(0, 3))

        switch (step) {
          case 'connect':
            if (code === 220) {
              step = 'ehlo'
              send(`EHLO ${process.env.MAIL_DOMAIN || 'localhost'}`)
            } else {
              reject(new Error(`Connection rejected: ${response}`))
              socket.end()
            }
            break

          case 'ehlo':
            if (code === 250) {
              step = 'mail'
              send(`MAIL FROM:<${from}>`)
            } else {
              reject(new Error(`EHLO failed: ${response}`))
              socket.end()
            }
            break

          case 'mail':
            if (code === 250) {
              step = 'rcpt'
              send(`RCPT TO:<${to[0]}>`)
            } else {
              reject(new Error(`MAIL FROM failed: ${response}`))
              socket.end()
            }
            break

          case 'rcpt':
            if (code === 250) {
              // Send remaining recipients or move to DATA
              to.shift()
              if (to.length > 0) {
                send(`RCPT TO:<${to[0]}>`)
              } else {
                step = 'data'
                send('DATA')
              }
            } else {
              reject(new Error(`RCPT TO failed: ${response}`))
              socket.end()
            }
            break

          case 'data':
            if (code === 354) {
              step = 'body'
              socket.write(data + '\r\n.\r\n')
            } else {
              reject(new Error(`DATA failed: ${response}`))
              socket.end()
            }
            break

          case 'body':
            if (code === 250) {
              step = 'quit'
              send('QUIT')
            } else {
              reject(new Error(`Message rejected: ${response}`))
              socket.end()
            }
            break

          case 'quit':
            resolve()
            socket.end()
            break
        }
      }

      socket.on('data', (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split('\r\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.length >= 3) {
            // Check for multi-line response (code followed by dash)
            if (line[3] === '-') continue
            processResponse(line)
          }
        }
      })

      socket.on('error', (err) => reject(err))
      socket.on('timeout', () => {
        reject(new Error('SMTP connection timed out'))
        socket.destroy()
      })
    })
  }
}
