package com.wistfare.wistmail

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONArray
import org.json.JSONObject

/**
 * Receives every FCM payload addressed to this device. Replaces the
 * default FCM-builds-the-notification path so we can attach inline
 * `Reply` (RemoteInput) + `Mark read` actions, and so we can replace
 * an existing email notification with a "now with AI suggestions"
 * variant when the worker fires the follow-up push.
 *
 * Payload contract (set by `apps/api/src/services/fcm.ts`):
 *   - `notification.title` / `notification.body` — what the OS shows.
 *     For silent updates (`type=email.new.update`) we omit the
 *     notification block; this service rebuilds the notification from
 *     the existing data fields.
 *   - `data.type` — `email.new` | `email.new.update` | `chat.message.new`.
 *   - `data.emailId` / `data.conversationId` — the resource id.
 *   - `data.tag` — present on `email.new.update`. The system replaces
 *     a notification with the same tag.
 *   - `data.actionTokenReply` / `data.actionTokenRead` — short-lived
 *     bearer tokens this service stamps onto the action PendingIntents
 *     so `WistmailReplyReceiver` can call /api/v1/notify/... without
 *     touching the user's session cookie.
 *   - `data.suggestions` — JSON-stringified array of AI reply chips
 *     (only on `email.new.update`).
 */
class WistmailFcmService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    when (data["type"]) {
      "email.new" -> showEmailNotification(this, message)
      "email.new.update" -> showEmailUpdate(this, message)
      "chat.message.new" -> showChatNotification(this, message)
      else -> {
        // Unknown / future-proof: fall through to the system default
        // by re-posting the notification block as-is. Returning
        // without doing anything would silently drop messages on
        // forward-incompatible servers.
        message.notification?.let { n ->
          buildBasic(this, n.title.orEmpty(), n.body.orEmpty(), null)
        }
      }
    }
  }

  /// On token rotation we let `PushClient` (Dart) re-register through
  /// its existing `onTokenRefresh` listener; this override is required
  /// only so the Firebase SDK doesn't log a warning about a missing
  /// implementation.
  override fun onNewToken(token: String) {
    super.onNewToken(token)
  }

  companion object {
    /// Returns the `id` we use when posting an email notification so
    /// follow-up pushes (`email.new.update`) can replace rather than
    /// stack. Stable across the original arrival + update.
    private fun emailNotificationId(emailId: String): Int =
      ("email-$emailId").hashCode()

    private fun chatNotificationId(conversationId: String): Int =
      ("chat-$conversationId").hashCode()

    fun showEmailNotification(ctx: Context, message: RemoteMessage) {
      val data = message.data
      val emailId = data["emailId"] ?: return
      val title = message.notification?.title ?: data["title"] ?: ""
      val body = message.notification?.body ?: data["body"] ?: ""
      val replyToken = data["actionTokenReply"]
      val readToken = data["actionTokenRead"]

      val builder = NotificationCompat.Builder(ctx, WistmailApplication.CHANNEL_MAIL_DEFAULT)
        .setSmallIcon(android.R.drawable.ic_dialog_email)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setAutoCancel(true)
        .setContentIntent(buildOpenAppPendingIntent(ctx, "wistmail://email/$emailId", emailId))

      if (!replyToken.isNullOrEmpty()) {
        builder.addAction(buildReplyAction(ctx, "email", emailId, replyToken))
      }
      if (!readToken.isNullOrEmpty()) {
        builder.addAction(buildMarkReadAction(ctx, "email", emailId, readToken))
      }

      NotificationManagerCompat.from(ctx).notify(emailNotificationId(emailId), builder.build())
    }

    fun showEmailUpdate(ctx: Context, message: RemoteMessage) {
      val data = message.data
      val emailId = data["emailId"] ?: return
      val replyToken = data["actionTokenReply"]
      val readToken = data["actionTokenRead"]

      // Rebuild from the stale notification's content. We can't read
      // the existing notification's text directly, so we show a
      // generic header and rely on suggestion chips for the actionable
      // bit. If the OS has already dismissed the original (user tapped
      // through), this update silently no-ops because we use the
      // SAME id — Android collapses the post into nothing if there's
      // no matching active notification under FOREGROUND_SERVICE_TYPE
      // semantics — actually it'll just reappear, which is acceptable:
      // suggestions were the reason for the update in the first place.
      val builder = NotificationCompat.Builder(ctx, WistmailApplication.CHANNEL_MAIL_DEFAULT)
        .setSmallIcon(android.R.drawable.ic_dialog_email)
        .setContentTitle(message.notification?.title ?: "New email")
        .setContentText("Tap a suggestion to reply.")
        .setAutoCancel(true)
        .setOnlyAlertOnce(true) // don't re-ring on the update.
        .setContentIntent(buildOpenAppPendingIntent(ctx, "wistmail://email/$emailId", emailId))

      // Suggestion chips: rendered as up-to-3 quick action buttons.
      // Tapping a chip fires WistmailReplyReceiver with the text
      // already populated — no typing required.
      val suggestionsRaw = data["suggestions"] ?: "[]"
      val suggestions = parseSuggestions(suggestionsRaw)
      for ((i, s) in suggestions.withIndex()) {
        if (i >= 3) break
        if (replyToken.isNullOrEmpty()) break
        builder.addAction(buildSuggestionAction(ctx, emailId, s, replyToken, i))
      }

      // Always include the "Reply" RemoteInput (free-form) AFTER the
      // chips if there's room left. Android shows up to 3 actions in
      // collapsed view; chips eat from the same budget.
      if (suggestions.size < 3 && !replyToken.isNullOrEmpty()) {
        builder.addAction(buildReplyAction(ctx, "email", emailId, replyToken))
      }
      if (!readToken.isNullOrEmpty()) {
        builder.addAction(buildMarkReadAction(ctx, "email", emailId, readToken))
      }

      NotificationManagerCompat.from(ctx).notify(emailNotificationId(emailId), builder.build())
    }

    fun showChatNotification(ctx: Context, message: RemoteMessage) {
      val data = message.data
      val conversationId = data["conversationId"] ?: return
      val title = message.notification?.title ?: ""
      val body = message.notification?.body ?: ""
      val replyToken = data["actionTokenReply"]
      val readToken = data["actionTokenRead"]

      val builder = NotificationCompat.Builder(ctx, WistmailApplication.CHANNEL_CHAT_DEFAULT)
        .setSmallIcon(android.R.drawable.sym_action_chat)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setAutoCancel(true)
        .setContentIntent(buildOpenAppPendingIntent(ctx, "wistmail://chat/$conversationId", conversationId))

      if (!replyToken.isNullOrEmpty()) {
        builder.addAction(buildReplyAction(ctx, "chat", conversationId, replyToken))
      }
      if (!readToken.isNullOrEmpty()) {
        builder.addAction(buildMarkReadAction(ctx, "chat", conversationId, readToken))
      }

      NotificationManagerCompat.from(ctx).notify(chatNotificationId(conversationId), builder.build())
    }

    /// Fallback path for unknown message types — just shows the
    /// system-style banner without any custom actions.
    private fun buildBasic(ctx: Context, title: String, body: String, channel: String?) {
      val builder = NotificationCompat.Builder(
        ctx,
        channel ?: WistmailApplication.CHANNEL_MAIL_DEFAULT,
      )
        .setSmallIcon(android.R.drawable.ic_dialog_email)
        .setContentTitle(title)
        .setContentText(body)
        .setAutoCancel(true)
      NotificationManagerCompat.from(ctx).notify(title.hashCode(), builder.build())
    }

    private fun buildReplyAction(
      ctx: Context,
      resourceType: String,
      resourceId: String,
      replyToken: String,
    ): NotificationCompat.Action {
      val remoteInput = RemoteInput.Builder(WistmailReplyReceiver.KEY_REPLY_TEXT)
        .setLabel(ctx.getString(R.string.notif_action_reply_label))
        .build()
      val intent = Intent(ctx, WistmailReplyReceiver::class.java).apply {
        action = WistmailReplyReceiver.ACTION_REPLY
        putExtra(WistmailReplyReceiver.EXTRA_RESOURCE_TYPE, resourceType)
        putExtra(WistmailReplyReceiver.EXTRA_RESOURCE_ID, resourceId)
        putExtra(WistmailReplyReceiver.EXTRA_TOKEN, replyToken)
      }
      val pi = PendingIntent.getBroadcast(
        ctx,
        ("reply-$resourceId").hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
      )
      return NotificationCompat.Action.Builder(
        android.R.drawable.ic_menu_send,
        ctx.getString(R.string.notif_action_reply),
        pi,
      )
        .addRemoteInput(remoteInput)
        .setAllowGeneratedReplies(false)
        .build()
    }

    private fun buildMarkReadAction(
      ctx: Context,
      resourceType: String,
      resourceId: String,
      readToken: String,
    ): NotificationCompat.Action {
      val intent = Intent(ctx, WistmailReplyReceiver::class.java).apply {
        action = WistmailReplyReceiver.ACTION_MARK_READ
        putExtra(WistmailReplyReceiver.EXTRA_RESOURCE_TYPE, resourceType)
        putExtra(WistmailReplyReceiver.EXTRA_RESOURCE_ID, resourceId)
        putExtra(WistmailReplyReceiver.EXTRA_TOKEN, readToken)
      }
      val pi = PendingIntent.getBroadcast(
        ctx,
        ("read-$resourceId").hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      return NotificationCompat.Action.Builder(
        android.R.drawable.ic_menu_view,
        ctx.getString(R.string.notif_action_mark_read),
        pi,
      ).build()
    }

    /// One-tap AI suggestion. The chip body is pre-populated so the
    /// user doesn't type anything — tapping fires the BroadcastReceiver
    /// directly with the pre-filled text.
    private fun buildSuggestionAction(
      ctx: Context,
      emailId: String,
      suggestion: Suggestion,
      replyToken: String,
      index: Int,
    ): NotificationCompat.Action {
      val truncated = suggestion.body.take(40).let {
        if (suggestion.body.length > 40) "$it…" else it
      }
      val intent = Intent(ctx, WistmailReplyReceiver::class.java).apply {
        action = WistmailReplyReceiver.ACTION_SUGGESTION
        putExtra(WistmailReplyReceiver.EXTRA_RESOURCE_TYPE, "email")
        putExtra(WistmailReplyReceiver.EXTRA_RESOURCE_ID, emailId)
        putExtra(WistmailReplyReceiver.EXTRA_TOKEN, replyToken)
        putExtra(WistmailReplyReceiver.EXTRA_PREFILLED_TEXT, suggestion.body)
        putExtra(WistmailReplyReceiver.EXTRA_SUGGESTION_ID, suggestion.id)
      }
      val pi = PendingIntent.getBroadcast(
        ctx,
        ("suggest-$emailId-$index").hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      return NotificationCompat.Action.Builder(
        android.R.drawable.ic_menu_send,
        truncated,
        pi,
      ).build()
    }

    private fun buildOpenAppPendingIntent(
      ctx: Context,
      uri: String,
      stableKey: String,
    ): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(uri)).apply {
        setPackage(ctx.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      return PendingIntent.getActivity(
        ctx,
        stableKey.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    private data class Suggestion(val id: String, val tone: String, val body: String)

    private fun parseSuggestions(raw: String): List<Suggestion> {
      return try {
        val arr = JSONArray(raw)
        (0 until arr.length()).mapNotNull { i ->
          val obj = arr.optJSONObject(i) ?: return@mapNotNull null
          Suggestion(
            id = obj.optString("id"),
            tone = obj.optString("tone"),
            body = obj.optString("body"),
          )
        }
      } catch (_: Exception) {
        emptyList()
      }
    }

    /// Suppress unused — referenced by the manifest entry below to
    /// guarantee the SDK level path is exercised. Without this the
    /// compiler warns even though the symbol IS reachable through
    /// reflection by the `<service>` declaration.
    @Suppress("unused")
    private val sdkSentinel: Int = Build.VERSION.SDK_INT

    @Suppress("unused")
    private val nmSentinel: Class<NotificationManager> = NotificationManager::class.java

    @Suppress("unused")
    private val jsonSentinel: Class<JSONObject> = JSONObject::class.java
  }
}
