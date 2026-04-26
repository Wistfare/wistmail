package com.wistfare.wistmail

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Handles taps on notification action buttons:
 *   - `ACTION_REPLY`     — user tapped Reply, typed text into the
 *                          inline RemoteInput, and confirmed.
 *   - `ACTION_SUGGESTION` — user tapped an AI suggestion chip; the
 *                          body is already in EXTRA_PREFILLED_TEXT.
 *   - `ACTION_MARK_READ` — user tapped Mark read.
 *
 * Each branch issues a one-shot HTTP call to /api/v1/notify/...
 * authenticated by the bearer token shipped in the FCM payload.
 * The receiver runs in the BroadcastReceiver context (~10s budget),
 * so we kick the HTTP call onto a background thread and use
 * `goAsync()` to keep the receiver alive long enough for the call
 * to complete. On success we cancel the notification; on failure we
 * leave it up so the user can tap "Reply" in-app and retry.
 */
class WistmailReplyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pendingResult = goAsync()
    val resourceType = intent.getStringExtra(EXTRA_RESOURCE_TYPE) ?: run {
      pendingResult.finish(); return
    }
    val resourceId = intent.getStringExtra(EXTRA_RESOURCE_ID) ?: run {
      pendingResult.finish(); return
    }
    val token = intent.getStringExtra(EXTRA_TOKEN) ?: run {
      pendingResult.finish(); return
    }

    when (intent.action) {
      ACTION_REPLY -> {
        val text = RemoteInput.getResultsFromIntent(intent)
          ?.getCharSequence(KEY_REPLY_TEXT)?.toString().orEmpty()
        if (text.isBlank()) {
          pendingResult.finish(); return
        }
        thread {
          try {
            val ok = sendReply(context, resourceType, resourceId, token, text)
            if (ok) cancelNotification(context, resourceType, resourceId)
            else replaceWithOpenAppFallback(context, resourceType, resourceId)
          } finally {
            pendingResult.finish()
          }
        }
      }
      ACTION_SUGGESTION -> {
        val text = intent.getStringExtra(EXTRA_PREFILLED_TEXT).orEmpty()
        if (text.isBlank()) {
          pendingResult.finish(); return
        }
        thread {
          try {
            val ok = sendReply(context, resourceType, resourceId, token, text)
            if (ok) cancelNotification(context, resourceType, resourceId)
            else replaceWithOpenAppFallback(context, resourceType, resourceId)
          } finally {
            pendingResult.finish()
          }
        }
      }
      ACTION_MARK_READ -> {
        thread {
          try {
            val ok = markRead(context, resourceType, resourceId, token)
            if (ok) cancelNotification(context, resourceType, resourceId)
            else replaceWithOpenAppFallback(context, resourceType, resourceId)
          } finally {
            pendingResult.finish()
          }
        }
      }
      else -> pendingResult.finish()
    }
  }

  private fun sendReply(
    context: Context,
    resourceType: String,
    resourceId: String,
    token: String,
    text: String,
  ): Boolean {
    val path = when (resourceType) {
      "email" -> "/api/v1/notify/emails/$resourceId/quick-reply"
      "chat" -> "/api/v1/notify/chat/conversations/$resourceId/quick-reply"
      else -> return false
    }
    val body = JSONObject().apply { put("content", text) }.toString()
    return postJson(context, path, token, body)
  }

  private fun markRead(
    context: Context,
    resourceType: String,
    resourceId: String,
    token: String,
  ): Boolean {
    val path = when (resourceType) {
      "email" -> "/api/v1/notify/emails/$resourceId/quick-read"
      "chat" -> "/api/v1/notify/chat/conversations/$resourceId/quick-read"
      else -> return false
    }
    return postJson(context, path, token, "{}")
  }

  private fun cancelNotification(context: Context, resourceType: String, resourceId: String) {
    val id = ("$resourceType-$resourceId").hashCode()
    NotificationManagerCompat.from(context).cancel(id)
  }

  /// Action token failed (401, network out, etc). Replace the
  /// notification with a "Open app to reply" variant so the user has
  /// a working escape hatch — silently failing the action would feel
  /// broken. Tapping the notification deep-links into the resource;
  /// the in-app reply UI is always available because it uses the
  /// session cookie.
  private fun replaceWithOpenAppFallback(
    context: Context,
    resourceType: String,
    resourceId: String,
  ) {
    val deepLink = when (resourceType) {
      "email" -> "wistmail://email/$resourceId"
      "chat" -> "wistmail://chat/$resourceId"
      else -> return
    }
    val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(deepLink)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val pi = android.app.PendingIntent.getActivity(
      context,
      ("fallback-$resourceId").hashCode(),
      intent,
      android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = androidx.core.app.NotificationCompat.Builder(
      context,
      WistmailApplication.CHANNEL_MAIL_DEFAULT,
    )
      .setSmallIcon(android.R.drawable.ic_dialog_email)
      .setContentTitle(context.getString(R.string.notif_action_open_app_to_reply))
      .setAutoCancel(true)
      .setContentIntent(pi)
    val id = ("$resourceType-$resourceId").hashCode()
    NotificationManagerCompat.from(context).notify(id, builder.build())
  }

  /// Fire a JSON POST with the bearer token. We use plain
  /// `HttpURLConnection` to avoid pulling another HTTP lib into the
  /// Android process — this is one POST per tap, performance is not a
  /// concern. Returns true on 2xx.
  private fun postJson(
    context: Context,
    path: String,
    token: String,
    body: String,
  ): Boolean {
    return try {
      val url = URL(apiBaseUrl(context) + path)
      val conn = url.openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.doOutput = true
      conn.setRequestProperty("Content-Type", "application/json")
      conn.setRequestProperty("Authorization", "Bearer $token")
      conn.connectTimeout = 10_000
      conn.readTimeout = 10_000
      OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }
      val code = conn.responseCode
      conn.disconnect()
      code in 200..299
    } catch (_: Exception) {
      false
    }
  }

  /// API base URL for action callbacks. Dev/staging override via
  /// `wistmail_api_base_url` meta-data; default points at the prod
  /// endpoint. Setting this in AndroidManifest's `<application>` keeps
  /// it discoverable next to the FCM service registration.
  private fun apiBaseUrl(context: Context): String {
    val ai = context.packageManager.getApplicationInfo(
      context.packageName,
      android.content.pm.PackageManager.GET_META_DATA,
    )
    return ai.metaData?.getString("wistmail_api_base_url")
      ?: "https://api.wistfare.com"
  }

  companion object {
    const val ACTION_REPLY = "com.wistfare.wistmail.ACTION_REPLY"
    const val ACTION_SUGGESTION = "com.wistfare.wistmail.ACTION_SUGGESTION"
    const val ACTION_MARK_READ = "com.wistfare.wistmail.ACTION_MARK_READ"

    const val KEY_REPLY_TEXT = "wistmail.reply.text"

    const val EXTRA_RESOURCE_TYPE = "wistmail.resourceType"
    const val EXTRA_RESOURCE_ID = "wistmail.resourceId"
    const val EXTRA_TOKEN = "wistmail.token"
    const val EXTRA_PREFILLED_TEXT = "wistmail.prefilledText"
    const val EXTRA_SUGGESTION_ID = "wistmail.suggestionId"

    /// Suppress unused — keeps the import alive for downstream
    /// Android lint rules that scan transitive references.
    @Suppress("unused")
    private val nmSentinel: Class<NotificationManager> = NotificationManager::class.java
  }
}
