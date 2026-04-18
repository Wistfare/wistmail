/**
 * Branded HTML email for password reset. Mirrors the visual style of
 * invitation.ts (light default + dark @media override).
 */
export function buildPasswordResetEmail(params: {
  displayName: string
  email: string
  resetUrl: string
  orgName: string
  expiresInMinutes: number
}): { html: string; text: string } {
  const { displayName, email, resetUrl, orgName, expiresInMinutes } = params
  const year = new Date().getFullYear()

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #0A0A0A !important; }
      .email-card { background-color: #111111 !important; border-color: #222222 !important; }
      .email-header { border-color: #222222 !important; }
      .email-heading { color: #E5E5E5 !important; }
      .email-text { color: #999999 !important; }
      .email-strong { color: #E5E5E5 !important; }
      .email-hint { color: #666666 !important; }
      .email-footer { border-color: #222222 !important; }
      .email-footer-text { color: #444444 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background-color:#F5F5F5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" class="email-card" style="background-color:#FFFFFF;border:1px solid #E5E5E5;">
          <tr>
            <td class="email-header" style="padding:28px 36px 24px;border-bottom:1px solid #E5E5E5;">
              <div style="display:inline-block;background-color:#C8FF00;width:36px;height:36px;text-align:center;line-height:36px;font-weight:700;font-size:16px;color:#0A0A0A;">W</div>
              <span class="email-heading" style="margin-left:12px;font-size:18px;font-weight:600;color:#111111;vertical-align:middle;">Wistfare Mail</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;">
              <h1 class="email-heading" style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111111;">
                Reset your password
              </h1>
              <p class="email-text" style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.6;">
                Hi ${displayName}, we received a request to reset the password for your <strong class="email-strong" style="color:#111111;">${orgName}</strong> account (<code>${email}</code>). Click the button below to choose a new password.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${resetUrl}" style="display:inline-block;background-color:#C8FF00;text-decoration:none;padding:14px 36px;">
                      <span style="font-size:14px;font-weight:600;color:#0A0A0A;font-family:'JetBrains Mono',monospace;">Reset password</span>
                    </a>
                  </td>
                </tr>
              </table>

              <p class="email-hint" style="margin:0 0 12px;font-size:12px;color:#999999;line-height:1.5;">
                This link expires in ${expiresInMinutes} minutes and can only be used once.
              </p>
              <p class="email-hint" style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                If you didn't request a password reset, you can safely ignore this email — your password won't change.
              </p>
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="padding:20px 36px;border-top:1px solid #E5E5E5;">
              <p class="email-footer-text" style="margin:0;font-size:11px;color:#AAAAAA;text-align:center;">
                &copy; ${year} Wistfare Mail
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `Reset your password — Wistfare Mail

Hi ${displayName},

We received a request to reset the password for your ${orgName} account (${email}).

Open this link to choose a new password:
${resetUrl}

The link expires in ${expiresInMinutes} minutes and can only be used once.

If you didn't request this, you can safely ignore this email.

(c) ${year} Wistfare Mail`

  return { html, text }
}
