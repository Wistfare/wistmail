/**
 * V3 transactional email: AdminWelcome.
 *
 * Sent to the OWNER account at the end of the domain-setup flow, immediately
 * after the workspace is provisioned. Mirrors `Email/V3-AdminWelcome` in
 * `design.lib.pen`.
 *
 * Structure (top → bottom):
 *   1. Eyebrow:        WELCOME TO WISTMAIL
 *   2. Hero:           "Your inbox," / "built for focus."
 *   3. Sub paragraph:  workspace context + role
 *   4. Trial card:     "WHAT YOU GET — 7-DAY ADMIN TRIAL" + 4 bullets + FREE pill
 *   5. Price card:     "$3 / per user / per month" + payment options
 *   6. CTA primary:    OPEN WORKSPACE
 *   7. Get-started:    3 numbered steps
 *   8. Help line:      reply-to-this-email
 */
import {
  V3,
  v3Layout,
  v3Eyebrow,
  v3Hero,
  v3Paragraph,
  v3Card,
  v3Button,
  v3Spacer,
  v3Divider,
  v3BulletItem,
  escape,
} from './_v3-layout.js'

export interface AdminWelcomeParams {
  displayName: string
  /** Workspace primary domain, e.g. "wistmail.com". */
  workspaceDomain: string
  /** Absolute URL to the admin dashboard. */
  workspaceUrl: string
  /** Reply-to address used in the footer fine-print. */
  fromAddress: string
  /** Trial length in days, default 7 (matches the design). */
  trialDays?: number
  /** Per-seat monthly price in USD. Default 3. */
  perSeatUsd?: number
}

export function buildAdminWelcomeEmail(params: AdminWelcomeParams): {
  html: string
  text: string
} {
  const {
    displayName,
    workspaceDomain,
    workspaceUrl,
    fromAddress,
    trialDays = 7,
    perSeatUsd = 3,
  } = params

  const trialCard = v3Card({
    variant: 'accent',
    inner: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${V3.accent};text-transform:uppercase;">
            What you get — ${trialDays}-day admin trial
          </td>
          <td align="right">
            <span style="display:inline-block;padding:4px 10px;background-color:${V3.accent};color:${V3.textOnAccent};border-radius:8px;font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;">FREE</span>
          </td>
        </tr>
      </table>
      <div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>
      ${v3BulletItem('1 admin seat · full owner access')}
      ${v3BulletItem('1 GB mail + attachment storage')}
      ${v3BulletItem('All apps unlocked — Mail · Chat · Calendar · Projects · Docs · Meetings')}
      ${v3BulletItem('End-to-end encrypted')}
    `,
  })

  const priceCard = v3Card({
    variant: 'surface',
    inner: `
      <p style="margin:0;font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${V3.textTertiary};text-transform:uppercase;">After the trial — pay as you scale</p>
      <div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="bottom" style="padding-right:14px;font-family:${V3.fontMono};font-size:48px;font-weight:700;letter-spacing:1px;color:${V3.accent};line-height:1;">$${perSeatUsd}</td>
          <td valign="bottom" style="padding-bottom:6px;">
            <p class="v3-text-primary" style="margin:0;font-family:${V3.fontMono};font-size:13px;font-weight:700;color:${V3.textPrimary};">per user</p>
            <p class="v3-text-secondary" style="margin:2px 0 0;font-family:${V3.fontMono};font-size:11px;font-weight:500;color:${V3.textSecondary};">per month · 1 GB included</p>
          </td>
        </tr>
      </table>
      ${v3Divider()}
      <p style="margin:0 0 10px;font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;color:${V3.textTertiary};text-transform:uppercase;">Payment options</p>
      ${paymentOption('Wallet auto-deduct (top up any time)', true)}
      <div style="height:8px;font-size:0;line-height:8px;">&nbsp;</div>
      ${paymentOption('Card · Debit / Credit', false)}
      <div style="height:8px;font-size:0;line-height:8px;">&nbsp;</div>
      ${paymentOption('MTN MoMo · Airtel Money', false)}
    `,
  })

  const getStarted = v3Card({
    variant: 'surface',
    inner: `
      <p style="margin:0 0 16px;font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${V3.textTertiary};text-transform:uppercase;">Get started in 3 steps</p>
      ${getStartedStep(1, 'Verify your domain', 'Add DKIM/SPF/DMARC so your mail lands in inboxes, not spam.')}
      ${getStartedStep(2, 'Invite your team', `Each new seat starts on the same ${trialDays}-day grace and gets its own welcome email.`)}
      ${getStartedStep(3, 'Top up your wallet', 'Pay once, scale anytime — wallet auto-deducts on each renewal.')}
    `,
  })

  const helpStrip = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${V3.bg};border:1px solid ${V3.border};border-radius:12px;">
    <tr>
      <td style="padding:14px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" width="22" style="padding-right:10px;font-family:${V3.fontMono};color:${V3.accent};font-weight:700;">?</td>
            <td valign="middle" class="v3-text-secondary" style="font-family:${V3.fontMono};font-size:11px;font-weight:500;color:${V3.textSecondary};">Need help? Reply to this email — a real human answers.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`

  const body = `
    ${v3Eyebrow('Welcome to Wistmail')}
    ${v3Spacer(20)}
    ${v3Hero({
      line1: 'Your inbox,',
      line2: 'built for focus.',
    })}
    ${v3Spacer(20)}
    ${v3Paragraph(
      `Hi ${displayName} — your workspace ${workspaceDomain} is live. You're the owner, with full admin access to invite teammates, manage billing, and configure security. Everything below gets you up and running in a few minutes.`,
    )}
    ${v3Spacer(28)}
    ${trialCard}
    ${v3Spacer(20)}
    ${priceCard}
    ${v3Spacer(28)}
    ${v3Button({ href: workspaceUrl, label: 'Open workspace' })}
    ${v3Spacer(28)}
    ${getStarted}
    ${v3Spacer(20)}
    ${helpStrip}
  `

  const html = v3Layout({
    preheader: `Your Wistmail workspace ${workspaceDomain} is live. ${trialDays}-day trial started.`,
    fromAddress,
    body,
  })

  const text = `Welcome to Wistmail

Hi ${displayName},

Your workspace ${workspaceDomain} is live. You're the owner with full admin access.

WHAT YOU GET — ${trialDays}-DAY ADMIN TRIAL (FREE)
  - 1 admin seat · full owner access
  - 1 GB mail + attachment storage
  - All apps unlocked — Mail · Chat · Calendar · Projects · Docs · Meetings
  - End-to-end encrypted

AFTER THE TRIAL
  $${perSeatUsd} per user per month (1 GB included). Pay via wallet auto-deduct,
  card, or MTN MoMo / Airtel Money.

OPEN YOUR WORKSPACE
  ${workspaceUrl}

GET STARTED IN 3 STEPS
  1. Verify your domain — DKIM/SPF/DMARC so mail lands in inboxes.
  2. Invite your team — each seat gets its own welcome email.
  3. Top up your wallet — pay once, scale anytime.

Need help? Reply to this email — a real human answers.

— Wistfare Mail · Kigali, Rwanda · ${fromAddress}`

  return { html, text }
}

function paymentOption(label: string, highlighted: boolean): string {
  const dot = highlighted ? V3.accent : V3.textSecondary
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${V3.bg};border:1px solid ${V3.border};border-radius:10px;">
    <tr>
      <td style="padding:10px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" width="22" style="padding-right:12px;color:${dot};font-family:${V3.fontMono};font-weight:700;">●</td>
            <td valign="middle" class="v3-text-primary" style="font-family:${V3.fontMono};font-size:12px;font-weight:500;color:${V3.textPrimary};">${escape(label)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}

function getStartedStep(n: number, title: string, desc: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">
    <tr>
      <td valign="top" width="40" style="padding-right:14px;">
        <div style="width:28px;height:28px;border-radius:14px;background-color:${V3.accentDim};border:1px solid ${V3.accent};text-align:center;line-height:28px;font-family:${V3.fontMono};font-size:12px;font-weight:700;color:${V3.accent};">${n}</div>
      </td>
      <td valign="top">
        <p class="v3-text-primary" style="margin:0;font-family:${V3.fontMono};font-size:13px;font-weight:700;color:${V3.textPrimary};">${escape(title)}</p>
        <p class="v3-text-secondary" style="margin:4px 0 0;font-family:${V3.fontMono};font-size:11px;font-weight:500;color:${V3.textSecondary};line-height:1.5;">${escape(desc)}</p>
      </td>
    </tr>
  </table>`
}
