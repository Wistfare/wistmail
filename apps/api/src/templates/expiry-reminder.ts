/**
 * V3 transactional email: ExpiryReminder.
 *
 * Sent when the workspace wallet balance is below the amount required for the
 * next renewal AND the renewal is within the configured warning window
 * (default 7 days). Mirrors `Email/V3-ExpiryReminder` in `design.lib.pen`.
 *
 * The template ALSO works as a generic "wallet low" reminder — both shortfall
 * and renewal copy are driven by the params, so the caller (billing-worker
 * cron) can decide which warning window applies.
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
  escape,
} from './_v3-layout.js'

export interface ExpiryReminderLineItem {
  label: string // e.g. "24 seats × $3.00 / mo"
  amountUsd: number // e.g. 72.0
}

export interface ExpiryReminderParams {
  displayName: string
  workspaceDomain: string
  /** Days remaining until renewal date. */
  daysLeft: number
  /** Renewal date as a display string, e.g. "Apr 21, 2026". */
  renewalDate: string
  /** Itemised renewal summary. Sums to totalDueUsd. */
  lineItems: ExpiryReminderLineItem[]
  /** Total the wallet must cover, in USD. */
  totalDueUsd: number
  /** Current wallet balance, in USD. */
  walletBalanceUsd: number
  /** Absolute URL to the top-up screen. */
  topUpUrl: string
  fromAddress: string
}

export function buildExpiryReminderEmail(params: ExpiryReminderParams): {
  html: string
  text: string
} {
  const {
    displayName,
    workspaceDomain,
    daysLeft,
    renewalDate,
    lineItems,
    totalDueUsd,
    walletBalanceUsd,
    topUpUrl,
    fromAddress,
  } = params

  const shortfallUsd = Math.max(0, totalDueUsd - walletBalanceUsd)
  const insufficient = shortfallUsd > 0

  // Top warning strip — only shown when the wallet truly can't cover renewal.
  const topStrip = insufficient
    ? `<tr>
        <td class="v3-warning-tint" style="background-color:${V3.warningTint};border-bottom:1px solid ${V3.warning};padding:12px 20px;text-align:center;font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:1.5px;color:${V3.warning};text-transform:uppercase;">
          ⚠ Action needed · wallet won't cover next renewal
        </td>
      </tr>`
    : ''

  const renewSummary = v3Card({
    variant: 'surface',
    inner: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${V3.textTertiary};text-transform:uppercase;">Renewal summary</td>
          <td align="right" style="font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:1.5px;color:${V3.textSecondary};text-transform:uppercase;">${escape(renewalDate)}</td>
        </tr>
      </table>
      <div style="height:14px;font-size:0;line-height:14px;">&nbsp;</div>
      ${lineItems
        .map(
          (item) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="v3-text-primary" style="padding:6px 0;font-family:${V3.fontMono};font-size:13px;font-weight:500;color:${V3.textPrimary};">${escape(item.label)}</td>
              <td align="right" class="v3-text-primary" style="padding:6px 0;font-family:${V3.fontMono};font-size:13px;font-weight:700;color:${V3.textPrimary};">${formatUsd(item.amountUsd)}</td>
            </tr>
          </table>`,
        )
        .join('')}
      ${v3Divider()}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:${V3.fontMono};font-size:11px;font-weight:700;letter-spacing:1.5px;color:${V3.textTertiary};text-transform:uppercase;">Total due</td>
          <td align="right" class="v3-text-primary" style="font-family:${V3.fontMono};font-size:24px;font-weight:700;color:${V3.textPrimary};">${formatUsd(totalDueUsd)}</td>
        </tr>
      </table>
    `,
  })

  const walletCard = v3Card({
    variant: insufficient ? 'error' : 'surface',
    inner: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${insufficient ? V3.error : V3.textTertiary};text-transform:uppercase;">⌧ Your wallet</td>
          <td align="right">
            <span style="display:inline-block;padding:3px 8px;background-color:${insufficient ? V3.error : V3.accentDim};color:${insufficient ? '#FFFFFF' : V3.accent};border-radius:6px;font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;">${insufficient ? 'INSUFFICIENT' : 'OK'}</span>
          </td>
        </tr>
      </table>
      <div style="height:14px;font-size:0;line-height:14px;">&nbsp;</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="bottom">
            <p style="margin:0 0 4px;font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;color:${V3.textTertiary};text-transform:uppercase;">Balance</p>
            <p class="v3-text-primary" style="margin:0;font-family:${V3.fontMono};font-size:32px;font-weight:700;color:${V3.textPrimary};line-height:1;">${formatUsd(walletBalanceUsd)}</p>
          </td>
          <td valign="bottom" align="right">
            <p style="margin:0 0 4px;font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;color:${V3.textTertiary};text-transform:uppercase;">${insufficient ? 'Shortfall' : 'Headroom'}</p>
            <p style="margin:0;font-family:${V3.fontMono};font-size:24px;font-weight:700;color:${insufficient ? V3.error : V3.accent};line-height:1;">${insufficient ? '− ' : '+ '}${formatUsd(Math.abs(insufficient ? shortfallUsd : walletBalanceUsd - totalDueUsd))}</p>
          </td>
        </tr>
      </table>
    `,
  })

  const grace = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${V3.bg};border:1px solid ${V3.border};border-radius:12px;">
    <tr>
      <td style="padding:16px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" width="24" style="padding-right:12px;color:${V3.textSecondary};font-family:${V3.fontMono};font-weight:700;">i</td>
            <td valign="top">
              <p class="v3-text-tertiary" style="margin:0 0 6px;font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;color:${V3.textTertiary};text-transform:uppercase;">What happens if you don't top up</p>
              <p class="v3-text-secondary" style="margin:0;font-family:${V3.fontMono};font-size:11px;font-weight:500;color:${V3.textSecondary};line-height:1.6;">
                Your workspace enters a 7-day grace period after ${escape(renewalDate)}. During grace, mail still flows but admin actions and new sign-ups are paused. After grace ends, outbound is suspended until the wallet is topped up.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`

  const body = `
    ${v3Eyebrow(`Reminder · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`, V3.warning)}
    ${v3Spacer(20)}
    ${v3Hero({
      line1: 'Subscription renews',
      line2: `on ${renewalDate}.`,
      size: 32,
    })}
    ${v3Spacer(20)}
    ${v3Paragraph(
      insufficient
        ? `Hi ${displayName} — your wallet balance is below the amount needed to renew ${workspaceDomain}. Top up before the renewal date to keep your workspace running without interruption.`
        : `Hi ${displayName} — heads up that ${workspaceDomain} renews on ${renewalDate}. Your wallet has enough to cover it, but you can review the breakdown below.`,
    )}
    ${v3Spacer(24)}
    ${renewSummary}
    ${v3Spacer(20)}
    ${walletCard}
    ${v3Spacer(24)}
    ${v3Button({ href: topUpUrl, label: insufficient ? 'Top up wallet' : 'View billing' })}
    ${v3Spacer(20)}
    ${grace}
  `

  const html = v3Layout({
    preheader: insufficient
      ? `Top up your Wistmail wallet — short ${formatUsd(shortfallUsd)} for renewal on ${renewalDate}.`
      : `Wistmail renews on ${renewalDate}. Wallet covered.`,
    fromAddress,
    body,
    topStrip,
  })

  const lines = lineItems
    .map((i) => `  ${i.label.padEnd(38, ' ')} ${formatUsd(i.amountUsd)}`)
    .join('\n')
  const text = `${insufficient ? 'ACTION NEEDED — wallet short' : 'Renewal reminder'}

Hi ${displayName},

${workspaceDomain} renews on ${renewalDate} (${daysLeft} day${daysLeft === 1 ? '' : 's'} away).

RENEWAL SUMMARY
${lines}
  ${'TOTAL DUE'.padEnd(38, ' ')} ${formatUsd(totalDueUsd)}

YOUR WALLET
  Balance:  ${formatUsd(walletBalanceUsd)}
  ${insufficient ? `Shortfall: −${formatUsd(shortfallUsd)} — ${insufficient ? 'INSUFFICIENT' : ''}` : `Headroom:  +${formatUsd(walletBalanceUsd - totalDueUsd)}`}

${insufficient ? 'Top up your wallet:' : 'Review billing:'}
  ${topUpUrl}

If you don't top up, your workspace enters a 7-day grace period after
${renewalDate}. Mail still flows during grace, but admin actions are paused.

— Wistfare Mail · ${fromAddress}`

  return { html, text }
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}
