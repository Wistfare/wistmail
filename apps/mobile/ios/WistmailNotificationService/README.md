# Wistmail Notification Service Extension

This directory contains the Swift sources for the iOS Notification
Service Extension that ships with the app. The extension intercepts
every push, sets the right `categoryIdentifier` so action chips draw,
and uses `threadIdentifier` so a follow-up `email.new.update` push
collapses with the original.

## One-time Xcode setup

The Swift files + `Info.plist` are checked in, but the Xcode project
file (`Runner.xcodeproj/project.pbxproj`) needs a new target. We
deliberately do NOT script that — text-editing pbxproj is unreliable
and the wrong move can corrupt the project beyond `xed` repair.

1. Open `apps/mobile/ios/Runner.xcworkspace` in Xcode.
2. **File → New → Target…**
3. Pick **Notification Service Extension** under iOS → Application
   Extension.
4. Settings:
   - Product Name: `WistmailNotificationService`
   - Bundle Identifier: `com.wistfare.wistmail.NotificationService`
     (must be a child of the main app's bundle id).
   - Language: Swift
   - Project: Runner
   - Embed in: Runner
5. Xcode will scaffold a new folder `WistmailNotificationService/`
   with stub files. **Delete** Xcode's `NotificationService.swift`
   and `Info.plist` and instead **add the existing files** in this
   directory by File → Add Files to "Runner"… → pick this folder.
6. Make sure the new target's **Deployment Target** matches the main
   Runner target (iOS 13+ recommended for `userText` on
   UNTextInputNotificationResponse).
7. In the main Runner target's **Signing & Capabilities** add the
   **Push Notifications** capability if it isn't already there.
8. Re-run `pod install` if your Podfile pulls in
   `Firebase/Messaging` for the extension target — typically NOT
   needed because the NSE doesn't need the Firebase SDK; the FCM
   payload is delivered to it as a regular APNS push by Firebase.

## Why this can't be auto-scripted

Adding a target requires editing `project.pbxproj` to add:

- New `PBXNativeTarget` for the extension
- New `PBXBuildPhase` entries (Sources / Frameworks / Resources)
- New `PBXFileReference` for each .swift / .plist
- A `PBXContainerItemProxy` linking the extension into the host app
- New `XCBuildConfiguration` entries per build configuration
- An `embedAppExtensions` build phase on the host target

The pbxproj is a JSON-ish format with auto-generated UUIDs and tight
internal cross-references. A single mis-ordered key has corrupted
projects in this codebase before. The 5-minute Xcode wizard does the
exact same surgery reliably.

## Sanity check after setup

1. Build the extension target (Xcode product picker → "Wistmail
   Notification Service" → Run).
2. Send a test push from the API:

   ```sh
   # In a separate shell, with the app installed on a real device:
   curl -i -X POST $API_BASE/api/v1/inbox/dev/test-push \
     -H "Authorization: Bearer $SESSION_COOKIE_VALUE"
   ```

   (Endpoint TBD — currently the simplest way is to send yourself
   an actual email via the SMTP path, which fires the real FCM push.)
3. Notification should arrive with **Reply** + **Mark read** action
   chips on long-press / pull-down.
4. Tap **Mark read** — the email's unread dot should disappear in the
   in-app inbox within ~1 s (WS event).

## File ownership

| File | Belongs to target |
| --- | --- |
| `NotificationService.swift` | WistmailNotificationService |
| `Info.plist` (this dir) | WistmailNotificationService |
| `apps/mobile/ios/Runner/AppDelegate.swift` | Runner |
| `apps/mobile/ios/Runner/NotificationActionDispatcher.swift` | Runner |
