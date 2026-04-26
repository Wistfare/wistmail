/// Cross-process channel: the AI worker tells the API "AI reply
/// suggestions are ready for email X belonging to user Y". The API
/// subscribes and dispatches a follow-up FCM push that the device
/// receives + uses to update the existing notification (matching by
/// tag) with the suggestion chips.
///
/// Same shape as `cache-bus.ts`. Kept separate so the channel intent
/// is clear from the Redis CHANNEL name and the API can subscribe to
/// each independently.

import { getRedis } from './redis.js'
import { sendEmailSuggestionsUpdate } from '../services/fcm.js'

const CHANNEL = 'wm:notification-update'

export interface SuggestionSnippet {
  id: string
  tone: string
  body: string
}

interface SuggestionsReadyMessage {
  type: 'email.suggestions.ready'
  userId: string
  emailId: string
  suggestions: SuggestionSnippet[]
}

/// Publish a "suggestions are ready" event. Called by the AI worker
/// after `draft-reply` writes its rows. Best-effort: a missing Redis
/// is logged and dropped — the suggestions still appear in-app on
/// next thread open, just not in the notification.
export async function publishSuggestionsReady(
  msg: SuggestionsReadyMessage,
): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.publish(CHANNEL, JSON.stringify(msg))
  } catch (err) {
    console.warn(
      '[notification-update-bus] publish failed:',
      (err as Error).message,
    )
  }
}

let started = false

/// Wire up the API's notification-update subscriber. Call once at
/// boot. Idempotent. Translates each "suggestions ready" event into
/// a follow-up FCM push.
export function startNotificationUpdateBus(): void {
  if (started) return
  started = true
  const redis = getRedis()
  if (!redis) return

  const sub = redis.duplicate({ enableOfflineQueue: true })
  sub.subscribe(CHANNEL).catch((err) => {
    console.warn('[notification-update-bus] subscribe failed:', err)
  })
  sub.on('message', (_channel: string, raw: string) => {
    try {
      const msg = JSON.parse(raw) as SuggestionsReadyMessage
      if (msg.type !== 'email.suggestions.ready') return
      void sendEmailSuggestionsUpdate({
        userId: msg.userId,
        emailId: msg.emailId,
        suggestions: msg.suggestions,
      }).catch((err) => {
        console.error(
          '[notification-update-bus] sendEmailSuggestionsUpdate failed:',
          err,
        )
      })
    } catch {
      // Bad payload — ignore.
    }
  })
}
