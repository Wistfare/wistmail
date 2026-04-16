import { eq } from 'drizzle-orm'
import { emails, sendingLogs } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

const MAIL_ENGINE_URL = process.env.MAIL_ENGINE_URL || 'http://mail-engine:8025'
const INBOUND_SECRET = process.env.INBOUND_SECRET || ''

/**
 * EmailSender delivers outbound emails via the mail engine's internal send API.
 * The mail engine performs MX lookup and direct SMTP delivery to recipient servers.
 */
export class EmailSender {
  constructor(private db: Database) {}

  async sendEmail(emailId: string): Promise<{ success: boolean; error?: string }> {
    const emailResult = await this.db.select().from(emails).where(eq(emails.id, emailId)).limit(1)
    if (emailResult.length === 0) {
      return { success: false, error: 'Email not found' }
    }
    const email = emailResult[0]

    const payload: Record<string, unknown> = {
      from: email.fromAddress,
      to: email.toAddresses,
      subject: email.subject,
    }

    if (email.cc && email.cc.length > 0) payload.cc = email.cc
    if (email.bcc && email.bcc.length > 0) payload.bcc = email.bcc
    if (email.htmlBody) payload.html = email.htmlBody
    if (email.textBody) payload.text = email.textBody
    if (email.inReplyTo) payload.inReplyTo = email.inReplyTo

    let lastError: string | undefined

    try {
      const response = await fetch(`${MAIL_ENGINE_URL}/api/v1/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Inbound-Secret': INBOUND_SECRET,
        },
        body: JSON.stringify(payload),
      })

      const data = (await response.json()) as { status?: string; error?: string }

      if (!response.ok) {
        lastError = data.error || `Mail engine error: ${response.status}`
        console.error(`Mail engine send failed for ${emailId}:`, lastError)
      } else {
        console.log(`Email ${emailId} sent via mail engine`)
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`Failed to send email ${emailId}:`, lastError)
    }

    const logId = generateId('slog')
    await this.db.insert(sendingLogs).values({
      id: logId,
      emailId,
      status: lastError ? 'failed' : 'sent',
      metadata: lastError ? { error: lastError } : {},
      createdAt: new Date(),
    })

    if (!lastError) {
      await this.db
        .update(emails)
        .set({ folder: 'sent', isDraft: false })
        .where(eq(emails.id, emailId))
    }

    return lastError ? { success: false, error: lastError } : { success: true }
  }
}
