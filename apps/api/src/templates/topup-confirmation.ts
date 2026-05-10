/**
 * V3 transactional email: TopUpConfirmation.
 *
 * Sent when a wallet top-up succeeds (provider webhook handler →
 * services/billing.ts → here). Mirrors `Email/V3-TopUpConfirmation` in
 * `design.lib.pen`.
 *
 * Structure:
 *   - Lime check-circle icon row + "PAYMENT RECEIVED" eyebrow with timestamp.
 *   - Hero: "Wallet topped up." / "+ $50.00 USD"
 *   - Receipt card: Amount / Source / Reference / Local equivalent
 *   - Balance card (accent-tinted): NEW WALLET BALANCE big number + delta %
 *   - Secondary CTA → VIEW BILLING
 */
import {
  V3,
  v3Layout,
  v3Eyebrow,
  v3Paragraph,
  v3Card,
  v3Button,
  v3Spacer,
  escape,
} from './_v3-layout.js'

export interface TopUpConfirmationParams {
  displayName: string
  /** Top-up amount in USD (positive). */
  amountUsd: number
  /** Local-currency equivalent shown for the user's region, optional. */
  localAmount?: { amount: number; currency: string }
  /** Wallet balance AFTER applying the top-up, in USD. */
  newBalanceUsd: number
  /** Wallet balance BEFORE the top-up — used to compute the delta percentage. */
  previousBalanceUsd: number
  /** Display label for payment source, e.g. "MTN MoMo · +250 78••••• 412". */
  paymentSource: string
  /** Provider transaction reference, e.g. "WMT-2026-04-14-A8K2". */
  reference: string
  /** Display timestamp for the payment, e.g. "APR 14, 2026 · 14:02 CAT". */
  paidAt: string
  /** How many renewal cycles the new balance covers, optional sub-copy. */
  renewalsCovered?: string
  /** Absolute URL to the billing page. */
  billingUrl: string
  fromAddress: string
}

export function buildTopUpConfirmationEmail(
  params: TopUpConfirmationParams,
): { html: string; text: string } {
  const {
    displayName,
    amountUsd,
    localAmount,
    newBalanceUsd,
    previousBalanceUsd,
    paymentSource,
    reference,
    paidAt,
    renewalsCovered,
    billingUrl,
    fromAddress,
  } = params

  const deltaPct =
    previousBalanceUsd > 0
      ? Math.round(((newBalanceUsd - previousBalanceUsd) / previousBalanceUsd) * 100)
      : 100
  const deltaLabel = `${deltaPct >= 0 ? '+' : ''}${deltaPct}%`

  const headerRow = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td valign="middle" width="70" style="padding-right:14px;">
        <div style="width:56px;height:56px;border-radius:28px;background-color:${V3.accent};text-align:center;line-height:56px;font-family:${V3.fontMono};font-weight:700;font-size:24px;color:${V3.textOnAccent};">✓</div>
      </td>
      <td valign="middle">
        ${v3Eyebrow('Payment received', V3.accent)}
        <p style="margin:4px 0 0;font-family:${V3.fontMono};font-size:10px;font-weight:500;letter-spacing:1.5px;color:${V3.textTertiary};text-transform:uppercase;">${escape(paidAt)}</p>
      </td>
    </tr>
  </table>`

  const heroBlock = `<div>
    <p class="v3-text-primary" style="margin:0;font-family:${V3.fontMono};font-size:32px;font-weight:700;letter-spacing:1px;color:${V3.textPrimary};line-height:1.1;">Wallet topped up.</p>
    <p style="margin:10px 0 0;font-family:${V3.fontMono};font-weight:700;line-height:1;">
      <span style="font-size:42px;letter-spacing:1px;color:${V3.accent};">+ ${formatUsd(amountUsd)}</span>
      <span style="font-size:12px;letter-spacing:1.5px;color:${V3.textTertiary};margin-left:8px;">USD</span>
    </p>
  </div>`

  const receipt = v3Card({
    variant: 'surface',
    inner: `
      <p style="margin:0 0 14px;font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${V3.textTertiary};text-transform:uppercase;">Receipt</p>
      ${receiptRow('Amount', formatUsd(amountUsd))}
      ${receiptRow('Source', paymentSource)}
      ${receiptRow('Reference', reference)}
      ${
        localAmount
          ? receiptRow(
              'Local equivalent',
              `≈ ${formatLocal(localAmount.amount, localAmount.currency)}`,
              V3.textTertiary,
            )
          : ''
      }
    `,
  })

  const balanceCard = v3Card({
    variant: 'accent',
    inner: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${V3.accent};text-transform:uppercase;">New wallet balance</td>
          <td align="right" style="font-family:${V3.fontMono};font-size:10px;font-weight:700;color:${V3.accent};">▲ ${escape(deltaLabel)}</td>
        </tr>
      </table>
      <div style="height:14px;font-size:0;line-height:14px;">&nbsp;</div>
      <p class="v3-text-primary" style="margin:0;font-family:${V3.fontMono};font-size:42px;font-weight:700;color:${V3.textPrimary};line-height:1;">${formatUsd(newBalanceUsd)}</p>
      ${
        renewalsCovered
          ? `<p class="v3-text-secondary" style="margin:14px 0 0;font-family:${V3.fontMono};font-size:11px;font-weight:500;color:${V3.textSecondary};line-height:1.5;">${escape(renewalsCovered)}</p>`
          : ''
      }
    `,
  })

  const body = `
    ${headerRow}
    ${v3Spacer(24)}
    ${heroBlock}
    ${v3Spacer(20)}
    ${v3Paragraph(
      `Thanks, ${displayName} — your top-up is in. Your wallet is ready to cover the next renewal and any usage that ticks over before then. Receipt details are below.`,
    )}
    ${v3Spacer(24)}
    ${receipt}
    ${v3Spacer(20)}
    ${balanceCard}
    ${v3Spacer(28)}
    ${v3Button({ href: billingUrl, label: 'View billing', variant: 'secondary' })}
  `

  const html = v3Layout({
    preheader: `+ ${formatUsd(amountUsd)} added. New wallet balance ${formatUsd(newBalanceUsd)}.`,
    fromAddress,
    body,
  })

  const text = `Payment received — ${paidAt}

Wallet topped up: + ${formatUsd(amountUsd)} USD

Hi ${displayName},

Thanks for topping up. Receipt details:

  Amount:           ${formatUsd(amountUsd)}
  Source:           ${paymentSource}
  Reference:        ${reference}${
    localAmount
      ? `\n  Local equivalent: ≈ ${formatLocal(localAmount.amount, localAmount.currency)}`
      : ''
  }

NEW WALLET BALANCE
  ${formatUsd(newBalanceUsd)} (${deltaLabel} vs previous)
${renewalsCovered ? `  ${renewalsCovered}\n` : ''}
View billing:
  ${billingUrl}

— Wistfare Mail · ${fromAddress}`

  return { html, text }
}

function receiptRow(
  label: string,
  value: string,
  valueColor: string = V3.textPrimary,
): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td class="v3-text-secondary" style="padding:6px 0;font-family:${V3.fontMono};font-size:12px;font-weight:500;color:${V3.textSecondary};">${escape(label)}</td>
      <td align="right" style="padding:6px 0;font-family:${V3.fontMono};font-size:13px;font-weight:700;color:${valueColor};">${escape(value)}</td>
    </tr>
  </table>`
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

function formatLocal(amount: number, currency: string): string {
  // Show whole units (RWF, KES etc.) — sub-unit precision rarely useful at scale.
  return `${Math.round(amount).toLocaleString('en-US')} ${currency}`
}
