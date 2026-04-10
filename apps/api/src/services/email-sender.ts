import { eq } from 'drizzle-orm'
import { emails, sendingLogs, mailboxes } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

const RESEND_API_URL = 'https://api.resend.com/emails'

/**
 * EmailSender handles email delivery via Resend API.
 * Resend handles DKIM signing, SPF, and SMTP delivery to recipient mail servers.
 */
export class EmailSender {
  constructor(private db: Database) {}

  /**
   * Send an email by its ID via Resend API.
   */
  async sendEmail(emailId: string): Promise<{ success: boolean; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return { success: false, error: 'RESEND_API_KEY not configured' }
    }

    // Fetch the email
    const emailResult = await this.db.select().from(emails).where(eq(emails.id, emailId)).limit(1)
    if (emailResult.length === 0) {
      return { success: false, error: 'Email not found' }
    }
    const email = emailResult[0]

    // Build Resend API payload
    const payload: Record<string, unknown> = {
      from: email.fromAddress,
      to: email.toAddresses,
      subject: email.subject,
    }

    if (email.cc && email.cc.length > 0) {
      payload.cc = email.cc
    }
    if (email.bcc && email.bcc.length > 0) {
      payload.bcc = email.bcc
    }
    if (email.htmlBody) {
      payload.html = email.htmlBody
    }
    if (email.textBody) {
      payload.text = email.textBody
    }
    if (email.inReplyTo) {
      payload.headers = {
        'In-Reply-To': `<${email.inReplyTo}>`,
      }
    }

    let lastError: string | undefined

    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = (await response.json()) as { id?: string; message?: string; statusCode?: number }

      if (!response.ok) {
        lastError = data.message || `Resend API error: ${response.status}`
        console.error(`Resend send failed for ${emailId}:`, lastError)
      } else {
        console.log(`Email ${emailId} sent via Resend (resend_id: ${data.id})`)
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`Failed to send email ${emailId}:`, lastError)
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
}
