/**
 * Branded HTML email template for user invitations.
 * Default: light theme (for Gmail which strips <style> tags).
 * Dark mode override via @media (prefers-color-scheme: dark) for Apple Mail, Outlook.
 */
export function buildInvitationEmail(params: {
  displayName: string
  newEmail: string
  tempPassword: string
  orgName: string
  loginUrl: string
}): { html: string; text: string } {
  const { displayName, newEmail, tempPassword, orgName, loginUrl } = params
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
      .email-cred-box { background-color: #1A1A1A !important; border-color: #333333 !important; }
      .email-cred-label { color: #666666 !important; }
      .email-cred-email { color: #C8FF00 !important; }
      .email-cred-pass { color: #E5E5E5 !important; }
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
          <!-- Header -->
          <tr>
            <td class="email-header" style="padding:28px 36px 24px;border-bottom:1px solid #E5E5E5;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background-color:#C8FF00;width:36px;height:36px;text-align:center;line-height:36px;font-weight:700;font-size:16px;color:#0A0A0A;">W</div>
                    <span class="email-heading" style="margin-left:12px;font-size:18px;font-weight:600;color:#111111;vertical-align:middle;">Wistfare Mail</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;">
              <h1 class="email-heading" style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111111;">
                Welcome to ${orgName}
              </h1>
              <p class="email-text" style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.6;">
                Hi ${displayName}, you've been invited to join <strong class="email-strong" style="color:#111111;">${orgName}</strong> on Wistfare Mail. Your account is ready &mdash; sign in with the credentials below.
              </p>

              <!-- Credentials -->
              <table width="100%" cellpadding="0" cellspacing="0" class="email-cred-box" style="background-color:#F9F9F9;border:1px solid #E0E0E0;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p class="email-cred-label" style="margin:0 0 12px;font-size:10px;font-weight:600;letter-spacing:1.5px;color:#888888;text-transform:uppercase;">Your Credentials</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="email-cred-label" style="padding:6px 0;font-size:12px;color:#888888;font-family:'JetBrains Mono',monospace;width:80px;">Email</td>
                        <td class="email-cred-email" style="padding:6px 0;font-size:14px;color:#5A7A00;font-family:'JetBrains Mono',monospace;font-weight:600;">${newEmail}</td>
                      </tr>
                      <tr>
                        <td class="email-cred-label" style="padding:6px 0;font-size:12px;color:#888888;font-family:'JetBrains Mono',monospace;width:80px;">Password</td>
                        <td class="email-cred-pass" style="padding:6px 0;font-size:14px;color:#111111;font-family:'JetBrains Mono',monospace;">${tempPassword}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${loginUrl}" style="display:inline-block;background-color:#C8FF00;text-decoration:none;padding:14px 36px;">
                      <span style="font-size:14px;font-weight:600;color:#0A0A0A;font-family:'JetBrains Mono',monospace;">Sign In to Wistfare Mail</span>
                    </a>
                  </td>
                </tr>
              </table>

              <p class="email-hint" style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                Please change your password after your first login for security.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-footer" style="padding:20px 36px;border-top:1px solid #E5E5E5;">
              <p class="email-footer-text" style="margin:0;font-size:11px;color:#AAAAAA;text-align:center;">
                &copy; ${year} Wistfare Mail &mdash; Wistfare Ltd.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `Welcome to ${orgName} on Wistfare Mail!

Hi ${displayName},

You've been invited to join ${orgName}. Here are your credentials:

  Email:    ${newEmail}
  Password: ${tempPassword}

Sign in at: ${loginUrl}

Please change your password after your first login.

(c) ${year} Wistfare Mail — Wistfare Ltd.`

  return { html, text }
}
