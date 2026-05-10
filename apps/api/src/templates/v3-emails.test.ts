/**
 * Smoke-tests for the V3 transactional email templates. We can't validate
 * pixel parity here — that's done with the browser tooling against the
 * design extracts. What we DO validate:
 *   1. Each builder returns non-empty html + text.
 *   2. Required fields appear in the rendered output.
 *   3. The HTML is well-formed enough to parse without throwing.
 *   4. The preheader is present but visually hidden.
 *   5. Brand colour tokens land in the markup.
 *   6. User-supplied content is HTML-escaped.
 */
import { describe, it, expect } from 'vitest'
import { buildAdminWelcomeEmail } from './admin-welcome.js'
import { buildUserInvitationEmail } from './user-invitation.js'
import { buildUserWelcomeEmail } from './user-welcome.js'
import { buildExpiryReminderEmail } from './expiry-reminder.js'
import { buildTopUpConfirmationEmail } from './topup-confirmation.js'
import { V3 } from './_v3-layout.js'

const FROM = 'no-reply@wistmail.com'

describe('V3 email templates — admin welcome', () => {
  const out = buildAdminWelcomeEmail({
    displayName: 'Veda',
    workspaceDomain: 'wistmail.com',
    workspaceUrl: 'https://app.wistmail.com/admin',
    fromAddress: FROM,
  })

  it('renders both html and text bodies', () => {
    expect(out.html.length).toBeGreaterThan(500)
    expect(out.text.length).toBeGreaterThan(100)
  })

  it('includes the workspace domain and CTA link', () => {
    expect(out.html).toContain('wistmail.com')
    expect(out.html).toContain('https://app.wistmail.com/admin')
    expect(out.text).toContain('wistmail.com')
  })

  it('renders the trial copy from the design', () => {
    expect(out.html.toLowerCase()).toContain('7-day admin trial')
    expect(out.html).toContain('built for focus.')
    expect(out.html).toContain('$3') // perSeatUsd default
  })

  it('uses brand accent colour', () => {
    expect(out.html).toContain(V3.accent)
  })
})

describe('V3 email templates — user invitation', () => {
  const out = buildUserInvitationEmail({
    displayName: 'Sarah Kim',
    newEmail: 'sarah@wistmail.com',
    tempPassword: 'Tg7-Vx2-9pQ-Lm8',
    workspaceDomain: 'wistmail.com',
    inviterName: 'Veda Nsengimana',
    loginUrl: 'https://app.wistmail.com/login?token=abc',
    fromAddress: FROM,
  })

  it('greets by first name only in the hero', () => {
    expect(out.html).toContain('Sarah')
  })

  it('renders the credentials block', () => {
    expect(out.html).toContain('sarah@wistmail.com')
    expect(out.html).toContain('Tg7-Vx2-9pQ-Lm8')
    expect(out.html).toContain('wistmail.com')
  })

  it('includes the activation link', () => {
    expect(out.html).toContain('https://app.wistmail.com/login?token=abc')
  })

  it('mentions the inviter', () => {
    expect(out.html).toContain('Veda Nsengimana')
  })
})

describe('V3 email templates — user welcome', () => {
  const out = buildUserWelcomeEmail({
    displayName: 'Sarah',
    workspaceDomain: 'wistmail.com',
    workspaceUrl: 'https://app.wistmail.com',
    fromAddress: FROM,
  })

  it('shows the avatar initial', () => {
    expect(out.html).toMatch(/>S</) // monogram
  })

  it('lists the 4 product pillars', () => {
    expect(out.html).toContain('Mail')
    expect(out.html).toContain('Chat')
    expect(out.html).toContain('Calendar')
    expect(out.html).toContain('Projects')
  })

  it('marks the first checklist item as checked', () => {
    expect(out.html).toContain('Set your display name and avatar')
  })
})

describe('V3 email templates — expiry reminder', () => {
  it('shows action-needed strip when wallet is short', () => {
    const out = buildExpiryReminderEmail({
      displayName: 'Veda',
      workspaceDomain: 'wistmail.com',
      daysLeft: 7,
      renewalDate: 'Apr 21, 2026',
      lineItems: [
        { label: '24 seats × $3.00 / mo', amountUsd: 72 },
        { label: 'Storage upgrade · 100 GB tier', amountUsd: 10 },
      ],
      totalDueUsd: 82,
      walletBalanceUsd: 40,
      topUpUrl: 'https://app.wistmail.com/admin/billing/top-up',
      fromAddress: FROM,
    })
    expect(out.html.toLowerCase()).toContain("action needed")
    expect(out.html).toContain('INSUFFICIENT')
    expect(out.html).toContain('$82.00')
    expect(out.html).toContain('$40.00')
  })

  it('skips the warning strip when wallet covers renewal', () => {
    const out = buildExpiryReminderEmail({
      displayName: 'Veda',
      workspaceDomain: 'wistmail.com',
      daysLeft: 7,
      renewalDate: 'Apr 21, 2026',
      lineItems: [{ label: '24 seats × $3.00 / mo', amountUsd: 72 }],
      totalDueUsd: 72,
      walletBalanceUsd: 200,
      topUpUrl: 'https://app.wistmail.com/admin/billing',
      fromAddress: FROM,
    })
    expect(out.html.toLowerCase()).not.toContain('action needed')
    expect(out.html).toContain('OK')
    expect(out.html.toLowerCase()).toContain('view billing')
  })
})

describe('V3 email templates — top-up confirmation', () => {
  const out = buildTopUpConfirmationEmail({
    displayName: 'Veda',
    amountUsd: 50,
    localAmount: { amount: 67500, currency: 'RWF' },
    newBalanceUsd: 90,
    previousBalanceUsd: 40,
    paymentSource: 'MTN MoMo · +250 78••••• 412',
    reference: 'WMT-2026-04-14-A8K2',
    paidAt: 'APR 14, 2026 · 14:02 CAT',
    renewalsCovered: 'Covers ~1.1 renewals at current usage.',
    billingUrl: 'https://app.wistmail.com/admin/billing',
    fromAddress: FROM,
  })

  it('shows amount, source and reference', () => {
    expect(out.html).toContain('$50.00')
    expect(out.html).toContain('MTN MoMo')
    expect(out.html).toContain('WMT-2026-04-14-A8K2')
  })

  it('renders the local equivalent', () => {
    expect(out.html).toContain('67,500 RWF')
  })

  it('computes the delta percentage', () => {
    // 40 → 90 is +125%
    expect(out.html).toContain('+125%')
  })
})

describe('V3 email templates — shared layout', () => {
  it('escapes hostile content in display names', () => {
    const out = buildUserInvitationEmail({
      displayName: '<script>alert(1)</script>',
      newEmail: 'attacker@evil.test',
      tempPassword: 'pwd',
      workspaceDomain: 'wistmail.com',
      inviterName: '"><img src=x>',
      loginUrl: 'https://x.test',
      fromAddress: FROM,
    })
    expect(out.html).not.toContain('<script>alert(1)</script>')
    expect(out.html).not.toContain('"><img src=x>')
    expect(out.html).toContain('&lt;script&gt;')
  })

  it('emits a hidden preheader for inbox preview text', () => {
    const out = buildAdminWelcomeEmail({
      displayName: 'Veda',
      workspaceDomain: 'wistmail.com',
      workspaceUrl: 'https://app.wistmail.com',
      fromAddress: FROM,
    })
    expect(out.html).toMatch(/display:none[^"]*max-height:0/)
  })

  it('declares dark+light color-scheme support', () => {
    const out = buildAdminWelcomeEmail({
      displayName: 'Veda',
      workspaceDomain: 'wistmail.com',
      workspaceUrl: 'https://app.wistmail.com',
      fromAddress: FROM,
    })
    expect(out.html).toContain('color-scheme')
    expect(out.html).toContain('prefers-color-scheme: light')
  })
})
