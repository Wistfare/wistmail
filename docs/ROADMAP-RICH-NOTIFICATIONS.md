# Roadmap — Rich notifications with inline reply & AI suggestions

## Goal

Push notifications that match the app's design and let the user act
without opening the app:

- **Reply** with an inline text field (Android) / "Reply" UNTextInput
  action (iOS).
- **Mark read** — single tap, dismisses the notification, marks the
  email or chat thread read server-side.
- **Suggested replies** — three short AI-generated replies as tap-to-
  send chips, mirroring the in-thread `ReplySuggestionStrip`.

## Why this is a multi-turn effort

1. **Auth from a background process**. The Flutter app's session
   cookie lives in a per-app cookie jar that the OS can't reach from
   `FirebaseMessagingService` (Android) or a Notification Service
   Extension (iOS). To act on a notification without opening the app
   we need a separate, scoped credential — see the action-token
   design below.
2. **Async AI timing**. The classifier / draft-reply jobs run in the
   background after the email lands. The push fires synchronously
   from `email-receiver.ts`. By the time the notification displays,
   suggestions are usually NOT ready. We need a follow-up "update
   notification" push from the AI worker once suggestions are
   available.
3. **Native scaffolding** on both platforms. Android needs a
   `FirebaseMessagingService` subclass + a `BroadcastReceiver` for
   action handling. iOS needs a Notification Service Extension
   (separate Swift target) to mutate the payload before display + a
   Notification Content Extension if we want a custom rendered card.

A half-implemented rich notification (e.g. action buttons that fail
silently because auth isn't wired) is worse UX than the current
default OS notification. Hence the deliberate split.

## Phase A — Action-token endpoint + scoped credentials

```
POST /api/v1/auth/notification-tokens
  Body: { resourceType: 'email'|'chat', resourceId: string, scope: 'reply'|'read' }
  Returns: { token: string, expiresAt: ISO }
```

- 24h JWT signed with `JWT_SECRET`.
- Claims: `userId`, `resourceType`, `resourceId`, `scope`.
- Backend pre-issues two tokens (one for `reply`, one for `read`) per
  notification-worthy event and stuffs them in the FCM data payload:

```json
{
  "data": {
    "type": "email.new",
    "emailId": "eml_abc",
    "tokens": { "reply": "eyJ…", "read": "eyJ…" }
  }
}
```

- New endpoints accept `Authorization: Bearer <token>` instead of
  cookies:
  - `POST /api/v1/inbox/emails/:id/quick-reply` (body: `{ content }`)
  - `POST /api/v1/inbox/emails/:id/quick-read` (no body)
  - Same shape for chat: `/chat/conversations/:id/quick-reply`,
    `/chat/conversations/:id/quick-read`.
- A token can only be redeemed once (deny-list in Redis, keyed by
  `jti`, TTL = the JWT lifetime).

This sidesteps the cookie-jar problem entirely and gives least-
privilege creds: a leaked token can only do the one thing it was
issued for.

## Phase B — AI suggestions via follow-up push

The AI worker's `draft-reply` job already writes to
`email_reply_suggestions`. After it finishes, the worker fires a
**second** FCM push with the same `tag` so the OS replaces the
existing notification instead of stacking:

```json
{
  "data": {
    "type": "email.new.update",
    "emailId": "eml_abc",
    "tag": "email-eml_abc",
    "suggestions": [
      { "id": "s1", "tone": "concise", "body": "Sounds good — see you Friday." },
      { "id": "s2", "tone": "warm",    "body": "Thanks for the heads-up! …" },
      { "id": "s3", "tone": "ask",     "body": "Got it — quick question: …" }
    ]
  }
}
```

The native side handles `email.new.update` as "find the existing
notification for this email and rebuild it with the suggestion
chips". Android does this via `NotificationCompat.Builder.setOnly...`
+ matching tag/id. iOS does it via the Notification Service Extension
mutating `bestAttemptContent`.

If the suggestions update never arrives (worker outage), the user
just sees the basic notification — no broken state.

## Phase C — Android implementation

Files to create:

- `apps/mobile/android/app/src/main/kotlin/com/wistfare/wistmail/WistmailFcmService.kt`
  - Subclass `FirebaseMessagingService`.
  - Override `onMessageReceived(message)` — build the notification
    with channels `mail` / `chat`, set actions per the design.
  - Reply action uses `RemoteInput` + a `PendingIntent` targeting
    `WistmailReplyReceiver`.
- `apps/mobile/android/app/src/main/kotlin/com/wistfare/wistmail/WistmailReplyReceiver.kt`
  - Subclass `BroadcastReceiver`.
  - Extract typed text from `RemoteInput.getResultsFromIntent`.
  - POST to `/quick-reply` with the action token.
  - On success: update the notification to "Sent". On failure: keep
    typed text + show retry.
- AndroidManifest additions:
  ```xml
  <service android:name=".WistmailFcmService" android:exported="false">
    <intent-filter>
      <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
  </service>
  <receiver android:name=".WistmailReplyReceiver" android:exported="false" />
  ```
- Notification channel setup (Android 8+) in `MainActivity.kt` or a
  one-shot `Application` subclass — channels: `mail_default`,
  `mail_focus_pierce`, `chat_default`. Importance maps to "high" for
  default, "low" for focus-pierce so calendar reminders during Focus
  mode don't make sound.

Required runtime permission (Android 13+):
- `POST_NOTIFICATIONS` — request via the existing FCM permission
  flow in `PushClient`.

## Phase D — iOS implementation

- New target: `WistmailNotificationService` (Notification Service
  Extension).
- `NotificationService.swift` — override
  `didReceive(_:withContentHandler:)` to:
  - If payload has inline `suggestions`, use them directly.
  - Otherwise fetch `/api/v1/inbox/emails/:id/reply-suggestions`
    using the action token.
  - Mutate `bestAttemptContent.userInfo` so the rendered card sees
    suggestions even when they arrived by follow-up push.
- `UNNotificationCategory` registered at app launch with two
  actions: `UNTextInputNotificationAction` (Reply) and a plain
  `UNNotificationAction` (Mark read).
- App's `UNUserNotificationCenterDelegate.didReceive` handles the
  responses (`reply` extracts `userText`, `read` calls `/quick-read`)
  and dismisses the notification.

Optional later: a Notification Content Extension to render the
suggestion chips as a custom view inside the expanded notification
card. Standard text actions cover the v1 happy path.

## Phase E — UX considerations

- **Don't show suggestion chips when Focus mode is on for that
  channel.** The notification might still pierce (calendar) but
  showing a "quick reply" chip during focus time is anti-pattern.
- **Localized "Reply" / "Mark read" labels.** Wire to the existing
  `intl` setup.
- **Quiet failure.** If the action-token endpoint 401s (user
  signed out on another device), update the notification to
  "Sign in to reply" and route to the app on tap.
- **Avoid double-fire.** Once an action token is redeemed (server
  Redis deny-list), the receiver should also cancel the
  notification locally so a second tap does nothing.

## Estimate

| Phase | Effort | Blocking? |
| --- | --- | --- |
| A — action-token endpoint + scoped routes | ~1 turn | yes (B/C/D depend on it) |
| B — follow-up suggestions push | ~½ turn | no (works without; chips just won't appear) |
| C — Android native | ~1 turn | independent |
| D — iOS native + NSE | ~1 turn | independent |
| E — UX polish + Focus integration | ~½ turn | last |

Total: ~4 turns to ship both platforms with full inline reply +
AI-suggestion chips.

## Current scaffolding

This roadmap doc is in place. The Dart side has a
`PushClient.registerForCurrentUser()` + `unregister()` flow with
proper FCM-token cleanup on sign-out (just hardened). No native
notification customization yet — Android shows the default OS
notification from the FCM `notification` payload, iOS the same.
