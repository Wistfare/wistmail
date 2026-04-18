import { eq } from 'drizzle-orm'
import { getDb } from '../lib/db.js'
import { deviceTokens } from '@wistmail/db'

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
  return sendToUser(input.userId, {
    notification: {
      title: senderDisplayName(input.fromAddress),
      body: input.subject || input.preview,
    },
    data: {
      type: 'email.new',
      emailId: input.emailId,
    },
  })
}

export async function sendChatNotification(input: ChatNotificationInput): Promise<number> {
  return sendToUser(input.userId, {
    notification: {
      title: input.senderName,
      body: input.content.slice(0, 140),
    },
    data: {
      type: 'chat.message.new',
      conversationId: input.conversationId,
    },
  })
}

async function sendToUser(userId: string, payload: Record<string, unknown>): Promise<number> {
  const messaging = await getMessaging()
  if (!messaging) return 0

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
