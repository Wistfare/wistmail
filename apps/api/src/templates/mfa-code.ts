/// Branded code email used for both backup-email setup verification and
/// email-as-MFA login challenges. Mirrors the visual style of
/// invitation.ts and password-reset.ts.
export function buildMfaCodeEmail(params: {
  displayName: string
  code: string
  orgName: string
  purpose: 'setup' | 'login'
  expiresInMinutes: number
}): { html: string; text: string } {
  const { displayName, code, orgName, purpose, expiresInMinutes } = params
  const year = new Date().getFullYear()
  const heading = purpose === 'login' ? 'Your sign-in code' : 'Verify this email address'
  const intro = purpose === 'login'
    ? `Hi ${displayName}, use the code below to finish signing in to <strong class="email-strong" style="color:#111111;">${orgName}</strong>. This code expires in ${expiresInMinutes} minutes.`
    : `Hi ${displayName}, enter this code in the app to confirm <strong class="email-strong" style="color:#111111;">${orgName}</strong> can use this address as a recovery factor. The code expires in ${expiresInMinutes} minutes.`

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
      .email-code-box { background-color: #1A2A08 !important; border-color: #BFFF00 !important; }
      .email-code-text { color: #BFFF00 !important; }
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
              <div style="display:inline-block;background-color:#BFFF00;width:36px;height:36px;text-align:center;line-height:36px;font-weight:700;font-size:16px;color:#0A0A0A;">W</div>
              <span class="email-heading" style="margin-left:12px;font-size:18px;font-weight:600;color:#111111;vertical-align:middle;">Wistfare Mail</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 36px;">
              <h1 class="email-heading" style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111111;">${heading}</h1>
              <p class="email-text" style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.6;">${intro}</p>

              <table width="100%" cellpadding="0" cellspacing="0" class="email-code-box" style="background-color:#F5FFC9;border:1px solid #BFFF00;margin-bottom:24px;">
                <tr>
                  <td align="center" style="padding:24px;">
                    <div class="email-code-text" style="font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;color:#0A0A0A;letter-spacing:8px;">${code}</div>
                  </td>
                </tr>
              </table>

              <p class="email-hint" style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
                If you didn't request this code, someone may be trying to access your account. You can ignore this email and the code will expire on its own.
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

  const text = `${heading} — Wistfare Mail

Hi ${displayName},

${purpose === 'login'
  ? `Use this code to finish signing in to ${orgName}.`
  : `Enter this code in the app to confirm this address can be used to recover your ${orgName} account.`}

  ${code}

The code expires in ${expiresInMinutes} minutes.

If you didn't request this, you can ignore this email.

(c) ${year} Wistfare Mail`

  return { html, text }
}
