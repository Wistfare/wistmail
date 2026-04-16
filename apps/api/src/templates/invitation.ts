/**
 * Branded HTML email template for user invitations.
 * Supports both dark and light mode via prefers-color-scheme.
 */
export function buildInvitationEmail(params: {
  displayName: string
  newEmail: string
  tempPassword: string
  orgName: string
  loginUrl: string
}): { html: string; text: string } {
  const { displayName, newEmail, tempPassword, orgName, loginUrl } = params

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; }
    @media (prefers-color-scheme: light) {
      .email-bg { background-color: #F5F5F5 !important; }
      .email-card { background-color: #FFFFFF !important; border-color: #E5E5E5 !important; }
      .email-header { border-color: #E5E5E5 !important; }
      .email-heading { color: #111111 !important; }
      .email-text { color: #555555 !important; }
      .email-text-strong { color: #111111 !important; }
      .email-cred-box { background-color: #F9F9F9 !important; border-color: #E0E0E0 !important; }
      .email-cred-label { color: #888888 !important; }
      .email-cred-value { color: #111111 !important; }
      .email-accent { color: #5A7A00 !important; }
      .email-btn { background-color: #5A7A00 !important; }
      .email-btn-text { color: #FFFFFF !important; }
      .email-hint { color: #999999 !important; }
      .email-footer { border-color: #E5E5E5 !important; }
      .email-footer-text { color: #AAAAAA !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background-color:#0A0A0A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" class="email-card" style="background-color:#111111;border:1px solid #222222;">
          <!-- Header -->
          <tr>
            <td class="email-header" style="padding:28px 36px 24px;border-bottom:1px solid #222222;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background-color:#C8FF00;width:36px;height:36px;text-align:center;line-height:36px;font-weight:700;font-size:16px;color:#0A0A0A;">W</div>
                    <span style="margin-left:12px;font-size:18px;font-weight:600;vertical-align:middle;" class="email-heading">
                      <span style="color:#E5E5E5;">Wistfare Mail</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 36px;">
              <h1 class="email-heading" style="margin:0 0 8px;font-size:22px;font-weight:600;color:#E5E5E5;">
                Welcome to ${orgName}
              </h1>
              <p class="email-text" style="margin:0 0 24px;font-size:14px;color:#999999;line-height:1.6;">
                Hi ${displayName}, you've been invited to join <strong class="email-text-strong" style="color:#E5E5E5;">${orgName}</strong> on Wistfare Mail. Your account is ready &mdash; sign in with the credentials below.
              </p>

              <!-- Credentials -->
              <table width="100%" cellpadding="0" cellspacing="0" class="email-cred-box" style="background-color:#1A1A1A;border:1px solid #333333;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p class="email-cred-label" style="margin:0 0 12px;font-size:10px;font-weight:600;letter-spacing:1.5px;color:#666666;text-transform:uppercase;">Your Credentials</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td class="email-cred-label" style="padding:6px 0;font-size:12px;color:#999999;font-family:'JetBrains Mono',monospace;width:80px;">Email</td>
                        <td class="email-accent" style="padding:6px 0;font-size:14px;color:#C8FF00;font-family:'JetBrains Mono',monospace;font-weight:600;">${newEmail}</td>
                      </tr>
                      <tr>
                        <td class="email-cred-label" style="padding:6px 0;font-size:12px;color:#999999;font-family:'JetBrains Mono',monospace;width:80px;">Password</td>
                        <td class="email-cred-value" style="padding:6px 0;font-size:14px;color:#E5E5E5;font-family:'JetBrains Mono',monospace;">${tempPassword}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${loginUrl}" class="email-btn" style="display:inline-block;background-color:#C8FF00;text-decoration:none;padding:14px 36px;">
                      <span class="email-btn-text" style="font-size:14px;font-weight:600;color:#0A0A0A;font-family:'JetBrains Mono',monospace;">Sign In to Wistfare Mail</span>
                    </a>
                  </td>
                </tr>
              </table>

              <p class="email-hint" style="margin:0;font-size:12px;color:#666666;line-height:1.5;">
                Please change your password after your first login for security.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-footer" style="padding:20px 36px;border-top:1px solid #222222;">
              <p class="email-footer-text" style="margin:0;font-size:11px;color:#444444;text-align:center;">
                &copy; ${new Date().getFullYear()} Wistfare Mail &mdash; Wistfare Ltd.
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

(c) ${new Date().getFullYear()} Wistfare Mail — Wistfare Ltd.`

  return { html, text }
}
