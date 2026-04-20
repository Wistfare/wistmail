import 'package:flutter/material.dart';

/// Global scaffold messenger key mounted on the root `MaterialApp`.
///
/// Widgets that want a snackbar to survive a route pop (most
/// commonly: "undo archive / delete" on the email detail screen,
/// which triggers a `context.pop()` immediately after firing the
/// mutation) can post to this messenger instead of the route-local
/// one. The default `ScaffoldMessenger.of(context)` returns the
/// messenger wrapping the current Scaffold — when that Scaffold is
/// disposed by the pop, its SnackBars get torn down too. The root
/// messenger lives as long as the app, so anything posted to it
/// stays on screen even as the user navigates.
///
/// Keep the usage narrow: only for snackbars that intentionally
/// outlive their originating screen. Route-local feedback (inline
/// errors, in-screen confirmations) should still go through
/// `ScaffoldMessenger.of(context)` so they dismiss naturally when
/// the route changes.
final GlobalKey<ScaffoldMessengerState> rootScaffoldMessengerKey =
    GlobalKey<ScaffoldMessengerState>();

/// Convenience helper — posts a SnackBar to the root messenger if
/// it's mounted (it always should be once `app.dart` has rendered),
/// otherwise silently drops. Callers shouldn't need a fallback path.
void showRootSnackBar(SnackBar snack) {
  final messenger = rootScaffoldMessengerKey.currentState;
  if (messenger == null) return;
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(snack);
}
