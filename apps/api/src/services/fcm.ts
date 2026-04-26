import { eq } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { deviceTokens, users } from '@wistmail/db'
import { issueNotificationToken } from './notification-tokens.js'

/// Notification channels honored by Focus Mode + per-channel prefs.
/// `mail` and `chat` are user-controllable; `calendar` is reserved
/// (calendar reminders should pierce Focus mode by design — they
/// represent a commitment, not an interruption). Add a key here +
/// extend `notification_prefs` JSON when introducing a new channel.
export type NotificationChannel = 'mail' | 'chat' | 'calendar'

/**
 * Firebase Cloud Messaging sender.
 *
 * Credentials are resolved in this order:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON — JSON contents inline in the env var.
 *      Preferred for CI/prod secrets (GitHub Actions, Fly, Render, K8s).
 *   2. GOOGLE_APPLICATION_CREDENTIALS — path to a JSON file. Preferred for
 *      local dev and Docker bind-mounts.
 *   3. Application Default Credentials fallback (e.g. `gcloud auth
 *      application-default login` or workload identity on GCP).
 *
 * If none of the above resolve, push is a silent no-op so the rest of the app
 * keeps working.
 */

// Lazy-initialize the firebase-admin SDK so tests that don't need FCM don't
// fail on missing credentials. Errors are cached to avoid re-attempting.
type MessagingLike = { send: (message: unknown) => Promise<string> }

let messagingPromise: Promise<MessagingLike | null> | null = null

async function getMessaging(): Promise<MessagingLike | null> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      try {
        const admin = await import('firebase-admin')
        if (!admin.apps.length) {
          const credential = resolveCredential(admin)
          admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || 'wistfare-1756656058858',
            ...(credential ? { credential } : {}),
          })
        }
        return admin.messaging() as unknown as MessagingLike
      } catch (err) {
        console.warn(
          '[fcm] firebase-admin not configured; skipping push:',
          (err as Error).message,
        )
        return null
      }
    })()
  }
  return messagingPromise
}

type AdminModule = typeof import('firebase-admin')

/**
 * Resolve a firebase-admin `Credential` from env, trying each form in priority
 * order. Returns undefined to fall back to Application Default Credentials.
 */
function resolveCredential(admin: AdminModule): ReturnType<AdminModule['credential']['cert']> | undefined {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (inlineJson && inlineJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(inlineJson) as Record<string, unknown>
      return admin.credential.cert(parsed as Parameters<typeof admin.credential.cert>[0])
    } catch (err) {
      console.warn(
        '[fcm] FIREBASE_SERVICE_ACCOUNT_JSON is set but not valid JSON:',
        (err as Error).message,
      )
    }
  }
  // GOOGLE_APPLICATION_CREDENTIALS (file path) is automatically picked up by
  // applicationDefault(); we return it explicitly so the intent is readable.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.applicationDefault()
  }
  // No explicit env — let firebase-admin try ADC / GCE metadata server.
  return undefined
}

export interface EmailNotificationInput {
  userId: string
  emailId: string
  fromAddress: string
  subject: string
  preview: string
}

export interface ChatNotificationInput {
  userId: string
  conversationId: string
  senderName: string
  content: string
}

export async function sendEmailNotification(input: EmailNotificationInput): Promise<number> {
  // Pre-issue per-action tokens so the OS-level notification can
  // call /api/v1/notify/emails/:id/quick-{reply,read} without ever
  // touching the user's session cookie. Each token is least-
  // privilege (one resource × one action) and one-shot via the
  // Redis deny-list. If JWT_SECRET isn't configured we silently
  // omit the tokens — the notification still appears, just without
  // action buttons. Production deployments are expected to set the
  // secret regardless because login uses it too.
  const tokens = tryIssueActionTokens({
    userId: input.userId,
    resourceType: 'email',
    resourceId: input.emailId,
  })
  return sendToUser(input.userId, 'mail', {
    notification: {
      title: senderDisplayName(input.fromAddress),
      body: input.subject || input.preview,
    },
    data: {
      type: 'email.new',
      emailId: input.emailId,
      ...tokens,
    },
  })
}

export async function sendChatNotification(input: ChatNotificationInput): Promise<number> {
  const tokens = tryIssueActionTokens({
    userId: input.userId,
    resourceType: 'chat',
    resourceId: input.conversationId,
  })
  return sendToUser(input.userId, 'chat', {
    notification: {
      title: input.senderName,
      body: input.content.slice(0, 140),
    },
    data: {
      type: 'chat.message.new',
      conversationId: input.conversationId,
      ...tokens,
    },
  })
}

/// Build the data-only FCM payload for a "AI suggestions ready"
/// follow-up push. Pure function so we can lock in the payload shape
/// in unit tests without standing up firebase-admin. The `tag` is
/// what the native side uses to find + replace the existing email
/// notification (matching by id pattern).
export function buildEmailSuggestionsPayload(input: {
  userId: string
  emailId: string
  suggestions: Array<{ id: string; tone: string; body: string }>
}): Record<string, unknown> {
  const tokens = tryIssueActionTokens({
    userId: input.userId,
    resourceType: 'email',
    resourceId: input.emailId,
  })
  return {
    data: {
      type: 'email.new.update',
      emailId: input.emailId,
      tag: `email-${input.emailId}`,
      suggestions: JSON.stringify(input.suggestions),
      ...tokens,
    },
  }
}

/// Follow-up push that lets the device replace the existing email
/// notification (same `tag`) with one carrying AI-generated reply
/// suggestion chips. Fired by the AI worker via the
/// `notification-update-bus` once the `draft-reply` job finishes.
///
/// Silent — no `notification` block, only `data`. The native side
/// reads the JSON, locates the existing notification by tag, and
/// rebuilds it with the chips. Calendar-pierce semantics don't apply
/// (this is an update of an existing mail notification, not a new
/// one), but we still gate on Focus mode + the mail channel pref so
/// a "this conversation got an AI suggestion" update doesn't pop
/// while the user is in Focus.
export async function sendEmailSuggestionsUpdate(input: {
  userId: string
  emailId: string
  suggestions: Array<{ id: string; tone: string; body: string }>
}): Promise<number> {
  const payload = buildEmailSuggestionsPayload(input)
  return sendToUser(input.userId, 'mail', payload)
}

/// Issue both reply + read tokens for a notification target. Wrapped
/// in a try so a missing JWT_SECRET (or any HMAC failure) degrades
/// gracefully — the push still goes out, just without action chips.
function tryIssueActionTokens(input: {
  userId: string
  resourceType: 'email' | 'chat'
  resourceId: string
}): { actionTokenReply?: string; actionTokenRead?: string } {
  try {
    const reply = issueNotificationToken({
      ...input,
      scope: 'reply',
    })
    const read = issueNotificationToken({
      ...input,
      scope: 'read',
    })
    return {
      actionTokenReply: reply.token,
      actionTokenRead: read.token,
    }
  } catch (err) {
    console.warn(
      '[fcm] could not issue action tokens (notification will lack action chips):',
      (err as Error).message,
    )
    return {}
  }
}

/// Returns true if a push for `channel` should reach `userId` right
/// now. Honors:
///   1. `users.focus_mode_enabled` + `users.focus_mode_until` — when
///      Focus is on and the until-time hasn't passed, drop pushes
///      for `mail` and `chat`. Calendar reminders pierce Focus by
///      design (they represent a commitment, not an interruption).
///   2. `users.notification_prefs[channel]` — explicit per-channel
///      mute. Missing key defaults to `true` (opt-out, not opt-in).
///
/// Exported for tests; call sites use `sendToUser` which gates
/// internally.
export async function shouldDeliverPush(
  userId: string,
  channel: NotificationChannel,
  now: Date = new Date(),
): Promise<{ deliver: boolean; reason?: string }> {
  const db = getDb()
  const rows = await db
    .select({
      focusModeEnabled: users.focusModeEnabled,
      focusModeUntil: users.focusModeUntil,
      notificationPrefs: users.notificationPrefs,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (rows.length === 0) {
    // Unknown user — fail safe by NOT pushing. Better to miss a
    // notification than to leak one to a deleted account's tokens
    // (which should already be gone via FK cascade, but belt-and-
    // suspenders).
    return { deliver: false, reason: 'user-not-found' }
  }
  const row = rows[0]

  // Focus mode: skip mail + chat while active. Calendar reminders
  // intentionally pierce.
  if (row.focusModeEnabled && (channel === 'mail' || channel === 'chat')) {
    const until = row.focusModeUntil
    // `focusModeUntil` is null for indefinite Focus; treat that as
    // "still on". A populated value gates on the timestamp.
    if (until === null || until > now) {
      return { deliver: false, reason: 'focus-mode' }
    }
  }

  // Per-channel pref. Missing key → opt-out (true), not opt-in.
  const prefs = (row.notificationPrefs ?? {}) as Partial<Record<NotificationChannel, boolean>>
  if (prefs[channel] === false) {
    return { deliver: false, reason: 'channel-muted' }
  }
  return { deliver: true }
}

async function sendToUser(
  userId: string,
  channel: NotificationChannel,
  payload: Record<string, unknown>,
): Promise<number> {
  const messaging = await getMessaging()
  if (!messaging) return 0

  // Honor Focus mode + per-channel prefs BEFORE looking up tokens
  // so an opted-out user pays no DB cost beyond the prefs lookup.
  const gate = await shouldDeliverPush(userId, channel)
  if (!gate.deliver) return 0

  const db = getDb()
  const tokens = await db
    .select({ token: deviceTokens.token })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId))

  if (tokens.length === 0) return 0

  let successCount = 0
  await Promise.allSettled(
    tokens.map(async ({ token }) => {
      try {
        await messaging.send({ token, ...payload })
        successCount++
      } catch (err) {
        const code = (err as { code?: string }).code
        // Remove permanently invalid tokens so we stop sending to them.
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token') {
          await db.delete(deviceTokens).where(eq(deviceTokens.token, token)).catch(() => {})
        }
      }
    }),
  )
  return successCount
}

export function senderDisplayName(fromAddress: string): string {
  const match = /^\s*(.*?)\s*<(.+)>\s*$/.exec(fromAddress)
  if (match && match[1]) return match[1].replace(/"/g, '').trim() || match[2]
  const at = fromAddress.indexOf('@')
  return at > 0 ? fromAddress.slice(0, at) : fromAddress
}
