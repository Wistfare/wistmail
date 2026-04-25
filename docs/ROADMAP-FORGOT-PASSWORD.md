# Forgot-password — follow-up scope

The mobile `ForgotPasswordScreen` is currently visual-only. The "Send Reset
Link" button is inert because the backend has no reset endpoint yet.

## Plan

### Backend

1. New schema: `password_reset_tokens` table — `id`, `userId`, `tokenHash`,
   `expiresAt`, `createdAt`.
2. `POST /api/v1/auth/forgot-password` — takes `{ email }`. Always returns
   200 to avoid account enumeration. If the email matches a user, generate a
   token, hash it, persist with a 30-minute TTL, and send a reset email via
   `EmailSender` (reuse the existing service).
3. `POST /api/v1/auth/reset-password` — takes `{ token, newPassword }`.
   Verifies the token, clears it, updates `passwordHash`, invalidates all
   existing sessions for the user.
4. Rate-limit the forgot-password endpoint by IP to prevent spam.
5. Email template: reuse the invitation template style — a single button
   pointing to `https://mail.wistfare.com/reset?token=…`.

### Web

- New route `/reset?token=…` that POSTs to `/auth/reset-password` and routes
  to sign-in on success.

### Mobile

- Wire the existing UI's email field + button to
  `POST /api/v1/auth/forgot-password`. Show a generic "If an account exists
  for that email, you'll get a reset link" toast regardless of the response.
- A deep link handler (`wistmail://reset?token=…`) can optionally route to
  an in-app reset screen. Can also just point at the web URL for v1.

## Why it's deferred

The mail-engine is plumbed but sending transactional email from the API
requires the full DKIM-signed pipeline to be running. For dev it's easier to
ship after the mail-engine Docker compose setup is stable. None of the rest
of the app depends on this flow.
