/**
 * Branded HTML email template for user invitations.
 * Sent to the user's external email with their new credentials.
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
</head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222222;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #222222;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-block;background-color:#C8FF00;width:36px;height:36px;text-align:center;line-height:36px;font-weight:700;font-size:16px;color:#0A0A0A;">W</div>
                    <span style="margin-left:12px;font-size:18px;font-weight:600;color:#E5E5E5;vertical-align:middle;">WistMail</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#E5E5E5;">
                Welcome to ${orgName}
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#999999;line-height:1.6;">
                Hi ${displayName}, you've been invited to join <strong style="color:#E5E5E5;">${orgName}</strong> on WistMail.
              </p>

              <!-- Credentials box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;border:1px solid #333333;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:1px;color:#666666;text-transform:uppercase;">Your credentials</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;font-size:12px;color:#999999;font-family:'JetBrains Mono',monospace;width:80px;">Email</td>
                        <td style="padding:6px 0;font-size:14px;color:#C8FF00;font-family:'JetBrains Mono',monospace;font-weight:600;">${newEmail}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;font-size:12px;color:#999999;font-family:'JetBrains Mono',monospace;width:80px;">Password</td>
                        <td style="padding:6px 0;font-size:14px;color:#E5E5E5;font-family:'JetBrains Mono',monospace;">${tempPassword}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${loginUrl}" style="display:inline-block;background-color:#C8FF00;color:#0A0A0A;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;font-family:'JetBrains Mono',monospace;">
                      Sign In to WistMail
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:#666666;line-height:1.6;">
                Please change your password after your first login for security.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #222222;">
              <p style="margin:0;font-size:11px;color:#555555;text-align:center;">
                WistMail — Self-hosted email for ${orgName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `Welcome to ${orgName} on WistMail!

Hi ${displayName},

You've been invited to join ${orgName}. Here are your credentials:

  Email:    ${newEmail}
  Password: ${tempPassword}

Sign in at: ${loginUrl}

Please change your password after your first login.

— WistMail`

  return { html, text }
}
