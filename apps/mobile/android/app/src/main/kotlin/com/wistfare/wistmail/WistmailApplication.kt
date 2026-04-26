package com.wistfare.wistmail

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import io.flutter.app.FlutterApplication

/**
 * Application subclass that registers our notification channels at
 * launch. Channels are required on Android 8+ (API 26) and must exist
 * before the first notification posts — otherwise the system shows a
 * default-style banner that ignores the per-channel importance / sound
 * settings the user later picks.
 *
 * Channels:
 *   - `mail_default` — high importance. New email arrivals.
 *   - `mail_focus_pierce` — low importance, no sound. Reserved for
 *     suggestion-update pushes that arrive while Focus mode is on:
 *     they shouldn't ring, but we still want them visible so the user
 *     sees suggestion chips when they unlock.
 *   - `chat_default` — high importance. New chat messages.
 *   - `calendar_default` — high importance. Calendar reminders. By
 *     design these pierce Focus mode (a meeting is a commitment),
 *     hence a separate channel so the user can opt them in/out
 *     independently.
 *
 * AndroidManifest.xml's `<application android:name>` points at this
 * class so it boots on every cold start.
 */
class WistmailApplication : FlutterApplication() {
  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java)

      nm.createNotificationChannel(
        NotificationChannel(
          CHANNEL_MAIL_DEFAULT,
          "New mail",
          NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          description = "New email arrivals."
        },
      )
      nm.createNotificationChannel(
        NotificationChannel(
          CHANNEL_MAIL_FOCUS_PIERCE,
          "Mail updates (silent)",
          NotificationManager.IMPORTANCE_LOW,
        ).apply {
          description = "AI reply suggestions arriving for an email already shown."
        },
      )
      nm.createNotificationChannel(
        NotificationChannel(
          CHANNEL_CHAT_DEFAULT,
          "Chat messages",
          NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          description = "New chat messages."
        },
      )
      nm.createNotificationChannel(
        NotificationChannel(
          CHANNEL_CALENDAR_DEFAULT,
          "Calendar reminders",
          NotificationManager.IMPORTANCE_HIGH,
        ).apply {
          description = "Upcoming meetings and event reminders."
        },
      )
    }
  }

  companion object {
    const val CHANNEL_MAIL_DEFAULT = "mail_default"
    const val CHANNEL_MAIL_FOCUS_PIERCE = "mail_focus_pierce"
    const val CHANNEL_CHAT_DEFAULT = "chat_default"
    const val CHANNEL_CALENDAR_DEFAULT = "calendar_default"
  }
}
