import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Register notification categories so action chips (Reply, Mark
    // read, AI suggestions) appear when the user long-presses or
    // expands a notification. The system needs the categories before
    // the first notification arrives.
    registerNotificationCategories()
    UNUserNotificationCenter.current().delegate = self
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }

  /// Two categories — one per resource type. Each carries a free-form
  /// `Reply` text-input action + a `Mark read` button. AI-suggestion
  /// chips can't be registered as static categories (their text varies
  /// per push), so they're emitted by the Notification Service
  /// Extension as additional dynamic actions on a third category we
  /// switch to when a follow-up push arrives.
  private func registerNotificationCategories() {
    let replyEmail = UNTextInputNotificationAction(
      identifier: ActionId.emailReply,
      title: NSLocalizedString("Reply", comment: ""),
      options: [.authenticationRequired],
      textInputButtonTitle: NSLocalizedString("Send", comment: ""),
      textInputPlaceholder: NSLocalizedString("Type a reply…", comment: "")
    )
    let readEmail = UNNotificationAction(
      identifier: ActionId.emailRead,
      title: NSLocalizedString("Mark read", comment: ""),
      options: []
    )
    let emailCategory = UNNotificationCategory(
      identifier: CategoryId.email,
      actions: [replyEmail, readEmail],
      intentIdentifiers: [],
      options: []
    )

    let replyChat = UNTextInputNotificationAction(
      identifier: ActionId.chatReply,
      title: NSLocalizedString("Reply", comment: ""),
      options: [.authenticationRequired],
      textInputButtonTitle: NSLocalizedString("Send", comment: ""),
      textInputPlaceholder: NSLocalizedString("Type a reply…", comment: "")
    )
    let readChat = UNNotificationAction(
      identifier: ActionId.chatRead,
      title: NSLocalizedString("Mark read", comment: ""),
      options: []
    )
    let chatCategory = UNNotificationCategory(
      identifier: CategoryId.chat,
      actions: [replyChat, readChat],
      intentIdentifiers: [],
      options: []
    )

    UNUserNotificationCenter.current().setNotificationCategories([emailCategory, chatCategory])
  }

  /// Handle taps on an action button. We don't handle the plain tap-
  /// to-open here — Flutter already routes on `onMessageOpenedApp`.
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let info = response.notification.request.content.userInfo
    let actionId = response.actionIdentifier
    Task {
      switch actionId {
      case ActionId.emailReply, ActionId.chatReply:
        let typed = (response as? UNTextInputNotificationResponse)?.userText ?? ""
        if !typed.isEmpty {
          await NotificationActionDispatcher.shared.sendReply(
            actionId: actionId,
            typedText: typed,
            userInfo: info
          )
        }
      case ActionId.emailRead, ActionId.chatRead:
        await NotificationActionDispatcher.shared.markRead(actionId: actionId, userInfo: info)
      default:
        break
      }
      completionHandler()
    }
    super.userNotificationCenter(center, didReceive: response, withCompletionHandler: {})
  }

  /// Show notifications even when the app is foregrounded so the user
  /// always sees them. Without this hook iOS silently swallows pushes
  /// that arrive while the app is open.
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .badge, .sound])
  }

  enum CategoryId {
    static let email = "wistmail.email"
    static let chat = "wistmail.chat"
  }

  enum ActionId {
    static let emailReply = "wistmail.email.reply"
    static let emailRead = "wistmail.email.read"
    static let chatReply = "wistmail.chat.reply"
    static let chatRead = "wistmail.chat.read"
  }
}
