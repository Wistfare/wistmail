import { createHmac, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { webhooks, webhookLogs } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

export type WebhookEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked'
  | 'email.failed'
  | 'email.received'

interface WebhookPayload {
  id: string
  type: WebhookEventType
  timestamp: string
  data: Record<string, unknown>
}

/**
 * Dispatches webhook events to all active endpoints subscribed to the event type.
 * Includes HMAC signature for payload verification and retry with exponential backoff.
 */
export class WebhookDispatcher {
  constructor(private db: Database) {}

  /**
   * Fire a webhook event. Runs asynchronously — does not block the caller.
   */
  async dispatch(event: WebhookEventType, data: Record<string, unknown>): Promise<void> {
    const payload: WebhookPayload = {
      id: `evt_${randomBytes(12).toString('hex')}`,
      type: event,
      timestamp: new Date().toISOString(),
      data,
    }

    // Find all active webhooks subscribed to this event
    const allWebhooks = await this.db.select().from(webhooks).where(eq(webhooks.active, true))

    const matching = allWebhooks.filter((wh) => {
      const events = wh.events as string[]
      return events.includes(event)
    })

    // Deliver to each webhook in parallel
    await Promise.allSettled(
      matching.map((wh) => this.deliver(wh.id, wh.url, wh.secret, payload)),
    )
  }

  /**
   * Deliver a webhook payload to a single endpoint with retry.
   */
  private async deliver(
    webhookId: string,
    url: string,
    secret: string,
    payload: WebhookPayload,
    maxRetries = 3,
  ): Promise<void> {
    const body = JSON.stringify(payload)
    const signature = this.sign(body, secret)

    const delays = [0, 1000, 5000, 30000] // immediate, 1s, 5s, 30s

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, delays[attempt] || 30000))
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': payload.type,
            'X-Webhook-Id': payload.id,
            'User-Agent': 'WistfareMail-Webhook/1.0',
          },
          body,
          signal: controller.signal,
        })

        clearTimeout(timeout)

        // Log the attempt
        await this.log(webhookId, payload, response.status, attempt + 1)

        if (response.ok) {
          return // Success
        }

        // 4xx errors (except 429) — don't retry
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          console.error(`Webhook ${webhookId}: ${url} returned ${response.status}, not retrying`)
          return
        }
      } catch (err) {
        // Network error or timeout
        await this.log(webhookId, payload, 0, attempt + 1)
        console.error(`Webhook ${webhookId}: delivery attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err)
      }
    }
  }

  /**
   * HMAC-SHA256 signature for payload verification.
   */
  private sign(body: string, secret: string): string {
    return createHmac('sha256', secret).update(body).digest('hex')
  }

  /**
   * Log a webhook delivery attempt.
   */
  private async log(
    webhookId: string,
    payload: WebhookPayload,
    responseStatus: number,
    attempts: number,
  ): Promise<void> {
    try {
      await this.db.insert(webhookLogs).values({
        id: generateId('whl'),
        webhookId,
        event: payload.type,
        payload: payload.data,
        responseStatus,
        attempts,
        createdAt: new Date(),
      })
    } catch (err) {
      console.error('Failed to log webhook delivery:', err)
    }
  }
}
