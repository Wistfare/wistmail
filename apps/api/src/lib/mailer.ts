/**
 * Centralised transactional-email sender.
 *
 * Posts a pre-rendered { html, text, subject } payload to the Go mail engine.
 * All V3 templates funnel through this helper so we have ONE place to swap
 * mailer implementations (e.g. switch to a queue, add per-org from-domain,
 * record a `mail_log` row, etc.) without grepping every route.
 */

export interface MailerSendParams {
  /** Recipient email. */
  to: string
  /** Subject line — keep under 78 chars to avoid header folding. */
  subject: string
  /** Pre-rendered HTML body. */
  html: string
  /** Pre-rendered plain-text fallback. */
  text: string
  /**
   * Display "From" friendly name. The address is built from the workspace
   * domain so DKIM aligns automatically.
   */
  fromName?: string
  /** Domain the email originates from, e.g. "wistmail.com". */
  fromDomain: string
  /**
   * Local-part of the From address. Defaults to "no-reply" — overridable for
   * org-specific transactional senders (e.g. "billing@" for receipts).
   */
  fromLocal?: string
  /** Optional Reply-To override (defaults to From). */
  replyTo?: string
  /** Per-message tag for downstream observability. */
  tag?: string
}

export interface MailerSendResult {
  delivered: boolean
  /** Engine response detail. */
  detail?: unknown
  error?: string
}

/**
 * Resolve the mail-engine URL with sensible defaults across local dev,
 * docker-compose, and production.
 */
function getMailEngineUrl(): string {
  return process.env.MAIL_ENGINE_URL || 'http://mail-engine:8025'
}

function getInboundSecret(): string {
  return process.env.INBOUND_SECRET || ''
}

export async function sendTransactionalEmail(
  params: MailerSendParams,
): Promise<MailerSendResult> {
  const {
    to,
    subject,
    html,
    text,
    fromName = 'Wistfare Mail',
    fromDomain,
    fromLocal = 'no-reply',
    replyTo,
    tag,
  } = params

  const fromAddr = `${fromLocal}@${fromDomain}`
  const url = `${getMailEngineUrl()}/api/v1/send`

  // Test environments: short-circuit so unit tests don't hit the network.
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return { delivered: true, detail: { skipped: 'test-env' } }
  }

  // Treat the mail-engine call as best-effort: caller-side audit/retry should
  // catch persistent failures. Throwing here would block account creation /
  // billing flows, which is worse than a missed welcome email.
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inbound-Secret': getInboundSecret(),
      },
      body: JSON.stringify({
        from: `"${fromName}" <${fromAddr}>`,
        to: [to],
        subject,
        html,
        text,
        ...(replyTo && { replyTo }),
        ...(tag && { tag }),
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(
        `[mailer] mail-engine ${res.status} for tag=${tag} to=${to}: ${body}`,
      )
      return { delivered: false, error: `engine ${res.status}` }
    }
    return { delivered: true }
  } catch (err) {
    console.error(`[mailer] dispatch failed tag=${tag} to=${to}:`, err)
    return {
      delivered: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
