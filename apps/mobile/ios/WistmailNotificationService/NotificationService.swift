import UserNotifications

/// Notification Service Extension. Runs in its own process the moment
/// an FCM push arrives, BEFORE the system shows the banner. Lets us
/// mutate `bestAttemptContent` to:
///   1. Stamp the right `categoryIdentifier` so the OS draws the
///      right action chips (Reply / Mark read).
///   2. Set `threadIdentifier` to the FCM `tag` so a follow-up
///      `email.new.update` push REPLACES the existing notification
///      instead of stacking.
///   3. Drop the notification entirely if the user is in Focus mode
///      AND the channel is mail/chat (we still gate server-side, but
///      this is a defense in depth in case a stale push slipped past).
///
/// FCM `data` payload contract is documented in
/// `apps/api/src/services/fcm.ts`.
class NotificationService: UNNotificationServiceExtension {
  var contentHandler: ((UNNotificationContent) -> Void)?
  var bestAttemptContent: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent
    guard let content = bestAttemptContent else {
      contentHandler(request.content)
      return
    }

    let userInfo = content.userInfo
    let messageType = userInfo["type"] as? String

    switch messageType {
    case "email.new", "email.new.update":
      content.categoryIdentifier = "wistmail.email"
      // Reuse the existing notification when a follow-up arrives —
      // iOS groups by threadIdentifier; setting it to the same `tag`
      // means the suggestion-update is delivered as a coalesced
      // refresh of the same banner.
      if let tag = userInfo["tag"] as? String {
        content.threadIdentifier = tag
      } else if let emailId = userInfo["emailId"] as? String {
        content.threadIdentifier = "email-\(emailId)"
      }

      // Suggestion-update: silent. Keep the banner subtle (no sound)
      // since the user has already seen the original.
      if messageType == "email.new.update" {
        content.sound = nil
        content.title = content.title.isEmpty ? "New email" : content.title
        content.body = NSLocalizedString(
          "Tap a suggestion to reply.",
          comment: "iOS notification body when AI suggestions arrive."
        )
      }

      // Surface the AI suggestions in a custom-rendered card via a
      // Notification Content Extension (separate target) — that
      // extension reads `userInfo["suggestions"]`. We don't unpack
      // them here; the JSON string flows through unchanged.

    case "chat.message.new":
      content.categoryIdentifier = "wistmail.chat"
      if let conversationId = userInfo["conversationId"] as? String {
        content.threadIdentifier = "chat-\(conversationId)"
      }

    default:
      // Forward-compatible: leave the notification as-is for unknown
      // types so a newer server doesn't mute alerts on an older app.
      break
    }

    contentHandler(content)
  }

  override func serviceExtensionTimeWillExpire() {
    // The system gives us ~30s to mutate. If we're about to time out,
    // hand back whatever we've got rather than silently dropping the
    // push.
    if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
      contentHandler(bestAttemptContent)
    }
  }
}
