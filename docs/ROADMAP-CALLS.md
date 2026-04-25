# Real-time audio/video calls — follow-up scope

The VoiceCall and VideoCall screens (`apps/mobile/lib/features/calls/`) are
currently UI-only stubs: they match the design visually but have no real WebRTC
plumbing. Wiring them up is a multi-day effort of its own.

## What's missing

1. **Signaling server**
   - A WebSocket channel (could reuse `/api/v1/stream` with new event types)
     carrying SDP offers, answers, and ICE candidates between peers.
   - Backend needs to know who is "in" a call (a `call_sessions` table or
     transient in-memory state) so offers route to the right devices.
2. **STUN/TURN**
   - STUN is usually free (Google's `stun:stun.l.google.com:19302`).
   - TURN is needed for NAT traversal when peers can't reach each other
     directly. Recommended: self-host [coturn](https://github.com/coturn/coturn)
     or use a provider (Twilio, Xirsys). Add creds to the API so they're
     served to clients over an authenticated endpoint.
3. **Flutter WebRTC**
   - Add `flutter_webrtc: ^0.x`.
   - For iOS: enable microphone + camera in `Info.plist`. For Android:
     permissions in `AndroidManifest.xml`.
   - New layer `core/rtc/` with a `RtcClient` exposing
     `createCall()`, `joinCall(offer)`, `toggleMic()`, `toggleCamera()`,
     `hangUp()`.
4. **Backend call orchestration**
   - `POST /api/v1/calls` — create a call, get an ID.
   - `POST /api/v1/calls/:id/ring` — notify the callee (push + WS).
   - WS events: `call.incoming`, `call.answered`, `call.ice`,
     `call.hangup`.
5. **UI integration**
   - Replace the static VoiceCall / VideoCall screens with live renderers
     pulling from the `RtcClient`.
   - Incoming-call full-screen via FCM background message → foreground push.

## Order of operations (when we pick this up)

1. Pick a TURN provider and store creds.
2. Extend the event bus with call events + a `call_sessions` table.
3. Add the Flutter WebRTC layer with a dummy "loopback" test (peer calling
   itself) to validate signalling end-to-end.
4. Wire the UI to the new client.
5. Add handling for background incoming calls via FCM.

## Why this isn't done here

Building this properly touches: backend schema + routes + WS events + TURN
infra + native platform permissions on both iOS and Android + two new Flutter
screens' business logic. All of that for a feature that's not on the critical
path. The stubs we shipped today are enough to exercise the rest of the app's
navigation flow and match the designs — real calls go in a focused session.
