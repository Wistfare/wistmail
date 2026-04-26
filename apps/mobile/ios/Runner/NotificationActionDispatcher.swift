import Foundation
import UserNotifications

/// Performs the HTTP calls behind the iOS notification action chips.
/// Reads the bearer tokens out of the FCM data payload (same shape as
/// the Android receiver) and POSTs to /api/v1/notify/... so the
/// action runs without ever touching the user's session cookie.
///
/// Lives in the main app target rather than the Notification Service
/// Extension because action handlers fire on the main app process —
/// the NSE only mutates the payload before display.
final class NotificationActionDispatcher {
  static let shared = NotificationActionDispatcher()

  /// Override-able for tests.
  var apiBaseUrl: String = {
    if let url = Bundle.main.object(forInfoDictionaryKey: "WistmailApiBaseUrl") as? String,
       !url.isEmpty {
      return url
    }
    return "https://api.wistfare.com"
  }()

  private init() {}

  func sendReply(actionId: String, typedText: String, userInfo: [AnyHashable: Any]) async {
    guard let token = userInfo["actionTokenReply"] as? String else { return }
    let body: [String: Any] = ["content": typedText]
    let path: String
    let resourceId: String
    switch actionId {
    case AppDelegate.ActionId.emailReply:
      guard let id = userInfo["emailId"] as? String else { return }
      resourceId = id
      path = "/api/v1/notify/emails/\(id)/quick-reply"
    case AppDelegate.ActionId.chatReply:
      guard let id = userInfo["conversationId"] as? String else { return }
      resourceId = id
      path = "/api/v1/notify/chat/conversations/\(id)/quick-reply"
    default:
      return
    }
    if await postJson(path: path, token: token, body: body) {
      cancelDelivered(forResourceId: resourceId, kind: kind(for: actionId))
    } else {
      await postFallbackNotification(forResourceId: resourceId, kind: kind(for: actionId))
    }
  }

  func markRead(actionId: String, userInfo: [AnyHashable: Any]) async {
    guard let token = userInfo["actionTokenRead"] as? String else { return }
    let path: String
    let resourceId: String
    switch actionId {
    case AppDelegate.ActionId.emailRead:
      guard let id = userInfo["emailId"] as? String else { return }
      resourceId = id
      path = "/api/v1/notify/emails/\(id)/quick-read"
    case AppDelegate.ActionId.chatRead:
      guard let id = userInfo["conversationId"] as? String else { return }
      resourceId = id
      path = "/api/v1/notify/chat/conversations/\(id)/quick-read"
    default:
      return
    }
    if await postJson(path: path, token: token, body: [:]) {
      cancelDelivered(forResourceId: resourceId, kind: kind(for: actionId))
    } else {
      await postFallbackNotification(forResourceId: resourceId, kind: kind(for: actionId))
    }
  }

  /// 401 / network out: replace the notification with a "Open app to
  /// reply" variant so the user has a working escape hatch. The
  /// in-app path uses the session cookie which is always available
  /// while the user is signed in.
  private func postFallbackNotification(forResourceId resourceId: String, kind: Kind) async {
    let id = kind == .email ? "email-\(resourceId)" : "chat-\(resourceId)"
    let content = UNMutableNotificationContent()
    content.title = NSLocalizedString(
      "Open app to reply",
      comment: "Shown when a notification action button can't reach the server."
    )
    content.userInfo = [
      "type": kind == .email ? "email.new" : "chat.message.new",
      kind == .email ? "emailId" : "conversationId": resourceId,
    ]
    content.threadIdentifier = id
    let req = UNNotificationRequest(identifier: id, content: content, trigger: nil)
    do {
      try await UNUserNotificationCenter.current().add(req)
    } catch {
      // Best-effort. If we can't post the fallback, the original
      // notification stays up; user can tap it as usual.
    }
  }

  private enum Kind { case email, chat }

  private func kind(for actionId: String) -> Kind {
    actionId.hasPrefix("wistmail.email") ? .email : .chat
  }

  /// Drop the notification once the action succeeded so the user doesn't
  /// see a stale one. The `request.identifier` we use matches the FCM
  /// payload's `tag` so updates land on the same notification — see
  /// `NotificationService.swift`.
  private func cancelDelivered(forResourceId resourceId: String, kind: Kind) {
    let id = kind == .email ? "email-\(resourceId)" : "chat-\(resourceId)"
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [id])
  }

  /// Plain `URLSession` POST with the bearer token. Returns true on 2xx.
  private func postJson(
    path: String,
    token: String,
    body: [String: Any]
  ) async -> Bool {
    guard let url = URL(string: apiBaseUrl + path) else { return false }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    do {
      req.httpBody = try JSONSerialization.data(withJSONObject: body)
    } catch {
      return false
    }
    do {
      let (_, response) = try await URLSession.shared.data(for: req)
      guard let http = response as? HTTPURLResponse else { return false }
      return (200...299).contains(http.statusCode)
    } catch {
      return false
    }
  }
}
