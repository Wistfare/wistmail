/**
 * Shared building blocks for V3 transactional emails.
 *
 * Reference: `Components/V3-Email` in `design.lib.pen` and the per-template
 * frames `Email/V3-AdminWelcome`, `Email/V3-UserInvitation`,
 * `Email/V3-UserWelcome`, `Email/V3-ExpiryReminder`, `Email/V3-TopUpConfirmation`.
 *
 * Brand language:
 *   - Black background (#000) with #111 cards and #1A1A1A borders.
 *   - Lime accent #BFFF00.
 *   - JetBrains Mono throughout, mostly 700 weight.
 *
 * Email-client compatibility notes:
 *   - We render dark-first because the design IS dark. A light fallback is
 *     supplied via @media (prefers-color-scheme: light) for clients that honour
 *     it (Apple Mail, Outlook web) so a user with explicit light-mode does not
 *     see a black email on a white background.
 *   - All structural styles are inlined on every element because Gmail strips
 *     <style> when forwarding and some clients (Outlook desktop) ignore it
 *     entirely. The <style> block only carries the prefers-color-scheme
 *     overrides.
 *   - Layout uses <table> with role="presentation" — required for Outlook.
 *   - Border-radius is best-effort (Outlook desktop ignores it; we accept that).
 */

export const V3 = {
  // Design tokens (mirrors `variables` in design.lib.pen)
  bg: '#000000',
  surface: '#111111',
  surfaceHover: '#1A1A1A',
  border: '#1A1A1A',
  borderHover: '#2A2A2A',
  accent: '#BFFF00',
  accentDim: '#1A2200',
  textPrimary: '#FFFFFF',
  textSecondary: '#999999',
  textTertiary: '#6E6E6E',
  textMuted: '#404040',
  textOnAccent: '#000000',
  warning: '#F59E0B',
  warningTint: '#F59E0B22',
  error: '#FF4444',
  errorTint: '#FF444411',
  info: '#3B82F6',

  // Typography
  fontMono:
    "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
} as const

// Light-mode fallback styles. Targets clients that respect prefers-color-scheme.
export const V3_DARK_MODE_STYLE = `
  :root { color-scheme: dark light; supported-color-schemes: dark light; }
  body, table, td { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse !important; }
  img { border: 0; outline: none; text-decoration: none; }
  a { text-decoration: none; }
  @media (prefers-color-scheme: light) {
    .v3-bg          { background-color: #F5F5F5 !important; }
    .v3-surface     { background-color: #FFFFFF !important; border-color: #E5E5E5 !important; }
    .v3-border      { border-color: #E5E5E5 !important; }
    .v3-text-primary   { color: #111111 !important; }
    .v3-text-secondary { color: #555555 !important; }
    .v3-text-tertiary  { color: #888888 !important; }
    .v3-text-muted     { color: #B0B0B0 !important; }
    .v3-accent-tint    { background-color: #F5FFC9 !important; border-color: #BFFF00 !important; }
    .v3-warning-tint   { background-color: #FFF7E6 !important; border-color: #F59E0B !important; }
    .v3-error-tint     { background-color: #FFEAEA !important; border-color: #FF4444 !important; }
  }
  @media only screen and (max-width: 600px) {
    .v3-shell { width: 100% !important; }
    .v3-padded { padding-left: 24px !important; padding-right: 24px !important; }
    .v3-h1 { font-size: 28px !important; }
    .v3-h1-big { font-size: 32px !important; }
    .v3-grid-col { display: block !important; width: 100% !important; }
  }
`

export interface V3LayoutParams {
  /** Plain-text preheader shown in the inbox preview. */
  preheader: string
  /** Address shown in the footer fine-print. */
  fromAddress: string
  /** Inner HTML for the email body (everything between header and footer). */
  body: string
  /** Optional pre-body banner (e.g. ExpiryReminder warning strip). */
  topStrip?: string
  /** Whether the body element should center children (UserWelcome). */
  centerBody?: boolean
}

export function v3Layout({
  preheader,
  fromAddress,
  body,
  topStrip,
  centerBody = false,
}: V3LayoutParams): string {
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<meta name="x-apple-disable-message-reformatting">
<title>Wistmail</title>
<style>${V3_DARK_MODE_STYLE}</style>
</head>
<body class="v3-bg" style="margin:0;padding:0;background-color:${V3.bg};font-family:${V3.fontMono};">
  <!-- Preheader: hidden in body, surfaces in inbox preview -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${escape(
    preheader,
  )}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="v3-bg" style="background-color:${V3.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" class="v3-shell v3-surface" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;background-color:${V3.bg};border:1px solid ${V3.border};border-radius:16px;overflow:hidden;">
          ${v3Header()}
          ${topStrip ?? ''}
          <tr>
            <td class="v3-bg v3-padded" style="background-color:${V3.bg};padding:36px 40px;text-align:${centerBody ? 'center' : 'left'};">
              ${body}
            </td>
          </tr>
          ${v3Footer({ fromAddress, year })}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function v3Header(): string {
  return `<tr>
    <td class="v3-surface v3-padded" style="background-color:${V3.surface};border-bottom:1px solid ${V3.border};padding:18px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="padding-right:14px;">
            <div style="display:inline-block;width:34px;height:34px;background-color:${V3.accent};border-radius:10px;text-align:center;line-height:34px;font-family:${V3.fontMono};font-weight:700;font-size:16px;color:${V3.textOnAccent};">W</div>
          </td>
          <td valign="middle" class="v3-text-primary" style="font-family:${V3.fontMono};font-size:13px;font-weight:700;letter-spacing:3px;color:${V3.textPrimary};">
            WISTFARE&nbsp;MAIL
          </td>
        </tr>
      </table>
    </td>
  </tr>`
}

function v3Footer({
  fromAddress,
  year,
}: {
  fromAddress: string
  year: number
}): string {
  return `<tr>
    <td class="v3-surface v3-padded" style="background-color:${V3.surface};border-top:1px solid ${V3.border};padding:28px 28px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:10px;">
                  <div style="display:inline-block;width:24px;height:24px;background-color:${V3.accent};border-radius:6px;text-align:center;line-height:24px;font-family:${V3.fontMono};font-weight:700;font-size:11px;color:${V3.textOnAccent};">W</div>
                </td>
                <td valign="middle" class="v3-text-primary" style="font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${V3.textPrimary};">
                  WISTFARE&nbsp;MAIL
                </td>
              </tr>
            </table>
          </td>
          <td align="right" class="v3-text-tertiary" style="font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;color:${V3.textTertiary};">
            <a href="#" style="color:${V3.textTertiary};text-decoration:none;">PRIVACY</a>
            &nbsp;&nbsp;<a href="#" style="color:${V3.textTertiary};text-decoration:none;">TERMS</a>
            &nbsp;&nbsp;<a href="#" style="color:${V3.textTertiary};text-decoration:none;">UNSUBSCRIBE</a>
          </td>
        </tr>
      </table>
      <div class="v3-border" style="height:1px;line-height:1px;font-size:0;background-color:${V3.border};margin:14px 0;">&nbsp;</div>
      <p class="v3-text-tertiary" style="margin:0 0 8px;font-family:${V3.fontMono};font-size:9px;font-weight:500;letter-spacing:1.2px;color:${V3.textTertiary};">
        WISTFARE TECHNOLOGIES · KIGALI, RWANDA · wistmail.com
      </p>
      <p class="v3-text-muted" style="margin:0;font-family:${V3.fontMono};font-size:9px;font-weight:500;color:${V3.textMuted};">
        You are receiving this because of your Wistmail account activity. Replies go to ${escape(
          fromAddress,
        )}. © ${year} Wistfare Technologies.
      </p>
    </td>
  </tr>`
}

// ── Reusable body fragments ─────────────────────────────────────────────────

export interface V3ButtonOpts {
  href: string
  label: string
  variant?: 'primary' | 'secondary'
  /** Bullet-line style block sometimes used in V3 (e.g. trial card). */
  block?: boolean
}

/** Solid lime CTA, height 52–60, JetBrains Mono 12–14px tracked uppercase. */
export function v3Button({
  href,
  label,
  variant = 'primary',
  block = true,
}: V3ButtonOpts): string {
  const isPrimary = variant === 'primary'
  const bg = isPrimary ? V3.accent : V3.surface
  const fg = isPrimary ? V3.textOnAccent : V3.textPrimary
  const border = isPrimary ? V3.accent : V3.border
  const cls = isPrimary ? '' : 'v3-surface'
  return `<table role="presentation" width="${block ? '100%' : ''}" cellpadding="0" cellspacing="0" border="0" style="${block ? 'width:100%;' : ''}">
    <tr>
      <td align="center" class="${cls}" style="background-color:${bg};border:1px solid ${border};border-radius:14px;">
        <a href="${href}" style="display:block;padding:18px 32px;font-family:${V3.fontMono};font-size:13px;font-weight:700;letter-spacing:2px;color:${fg};text-decoration:none;text-transform:uppercase;">
          ${escape(label)}
        </a>
      </td>
    </tr>
  </table>`
}

/** Eyebrow label — small uppercase tracked text. */
export function v3Eyebrow(text: string, color: string = V3.accent): string {
  return `<p style="margin:0;font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${color};text-transform:uppercase;">${escape(text)}</p>`
}

/** Hero block: two stacked headline lines, primary then accent. */
export function v3Hero({
  line1,
  line2,
  size = 34,
}: {
  line1: string
  line2: string
  size?: number
}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td class="v3-text-primary v3-h1-big" style="font-family:${V3.fontMono};font-size:${size}px;font-weight:700;letter-spacing:1px;color:${V3.textPrimary};line-height:1.1;">${escape(line1)}</td></tr>
    <tr><td style="padding-top:6px;font-family:${V3.fontMono};font-size:${size}px;font-weight:700;letter-spacing:1px;color:${V3.accent};line-height:1.1;">${escape(line2)}</td></tr>
  </table>`
}

/** Body paragraph in secondary text color. */
export function v3Paragraph(text: string): string {
  return `<p class="v3-text-secondary" style="margin:0;font-family:${V3.fontMono};font-size:13px;font-weight:500;color:${V3.textSecondary};line-height:1.6;">${escape(text)}</p>`
}

/** Surface card. Pass full inner HTML. */
export function v3Card({
  inner,
  variant = 'surface',
}: {
  inner: string
  variant?: 'surface' | 'accent' | 'warning' | 'error'
}): string {
  const styles = {
    surface: { bg: V3.surface, border: V3.border, cls: 'v3-surface' },
    accent: { bg: V3.accentDim, border: V3.accent, cls: 'v3-accent-tint' },
    warning: { bg: V3.warningTint, border: V3.warning, cls: 'v3-warning-tint' },
    error: { bg: V3.errorTint, border: V3.error, cls: 'v3-error-tint' },
  }[variant]
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="${styles.cls}" style="background-color:${styles.bg};border:1px solid ${styles.border};border-radius:16px;">
    <tr>
      <td style="padding:24px;">
        ${inner}
      </td>
    </tr>
  </table>`
}

/** Vertical spacer that survives Outlook. */
export function v3Spacer(height: number): string {
  return `<div style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</div>`
}

/** Horizontal divider line. */
export function v3Divider(): string {
  return `<div class="v3-border" style="height:1px;line-height:1px;font-size:0;background-color:${V3.border};margin:14px 0;">&nbsp;</div>`
}

/** Two-column row used in receipts and renewal summaries. */
export function v3KeyValueRow({
  label,
  value,
  valueColor = V3.textPrimary,
  bold = true,
}: {
  label: string
  value: string
  valueColor?: string
  bold?: boolean
}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;">
    <tr>
      <td class="v3-text-secondary" style="padding:6px 0;font-family:${V3.fontMono};font-size:12px;font-weight:500;color:${V3.textSecondary};">${escape(label)}</td>
      <td align="right" style="padding:6px 0;font-family:${V3.fontMono};font-size:13px;font-weight:${bold ? 700 : 500};color:${valueColor};">${escape(value)}</td>
    </tr>
  </table>`
}

/** Single icon-bullet item. Used in trial card / get-started list. */
export function v3BulletItem(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td valign="middle" width="20" style="padding:6px 12px 6px 0;color:${V3.accent};font-family:${V3.fontMono};font-weight:700;">✓</td>
      <td valign="middle" class="v3-text-primary" style="padding:6px 0;font-family:${V3.fontMono};font-size:13px;font-weight:500;color:${V3.textPrimary};line-height:1.5;">${escape(text)}</td>
    </tr>
  </table>`
}

/** Escape user-supplied content destined for HTML body. */
export function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
