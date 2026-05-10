/**
 * V3 transactional email: UserWelcome.
 *
 * Sent on a user's first successful sign-in (or after they set their initial
 * password from the invitation flow). Mirrors `Email/V3-UserWelcome` in
 * `design.lib.pen`.
 *
 * Layout highlights:
 *   - Centered card-style content (the design uses `alignItems='center'`).
 *   - 2×2 feature grid: Mail / Chat / Calendar / Projects · Docs.
 *   - First-day checklist with the first item already checked.
 *   - Single primary CTA — OPEN WISTMAIL.
 */
import {
  V3,
  v3Layout,
  v3Eyebrow,
  v3Paragraph,
  v3Button,
  v3Spacer,
  escape,
} from './_v3-layout.js'

export interface UserWelcomeParams {
  displayName: string
  /** Workspace primary domain (for sub-copy). */
  workspaceDomain: string
  /** Avatar background color. Optional — defaults to design's #1B6FE0. */
  avatarColor?: string
  /** Absolute URL to open the inbox. */
  workspaceUrl: string
  fromAddress: string
}

export function buildUserWelcomeEmail(params: UserWelcomeParams): {
  html: string
  text: string
} {
  const {
    displayName,
    workspaceDomain,
    avatarColor = '#1B6FE0',
    workspaceUrl,
    fromAddress,
  } = params
  const initial =
    (displayName.trim()[0] || 'U').toUpperCase().slice(0, 1) || 'U'
  const firstName = displayName.split(/\s+/)[0] ?? displayName

  const heroBlock = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td valign="middle" style="padding-right:14px;">
        <div style="width:56px;height:56px;border-radius:28px;background-color:${avatarColor};text-align:center;line-height:56px;font-family:${V3.fontMono};font-size:22px;font-weight:700;color:#FFFFFF;">${escape(initial)}</div>
      </td>
      <td valign="middle">
        <p class="v3-text-primary" style="margin:0;font-family:${V3.fontMono};font-size:30px;font-weight:700;letter-spacing:1px;color:${V3.textPrimary};line-height:1.1;">Hi ${escape(firstName)} 👋</p>
        <p style="margin:6px 0 0;font-family:${V3.fontMono};font-size:18px;font-weight:700;letter-spacing:0.5px;color:${V3.accent};line-height:1.1;">Your inbox is ready.</p>
      </td>
    </tr>
  </table>`

  // 2×2 feature grid. Render as nested tables so Outlook renders columns.
  const featureGrid = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td valign="top" class="v3-grid-col" width="50%" style="padding:0 6px 12px 0;">${featureCard('✉', 'Mail', 'A focused inbox with smart triage and AI summaries.')}</td>
      <td valign="top" class="v3-grid-col" width="50%" style="padding:0 0 12px 6px;">${featureCard('💬', 'Chat', 'DMs and team channels — same login, same shortcuts.')}</td>
    </tr>
    <tr>
      <td valign="top" class="v3-grid-col" width="50%" style="padding:0 6px 0 0;">${featureCard('📅', 'Calendar', 'Schedule, RSVP and run meetings without leaving the app.')}</td>
      <td valign="top" class="v3-grid-col" width="50%" style="padding:0 0 0 6px;">${featureCard('◫', 'Projects · Docs', 'Tasks, boards and shared docs that turn email into action.')}</td>
    </tr>
  </table>`

  // First-day checklist. Item 1 is checked by design; items 2-5 are open boxes.
  const checklist = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="v3-surface" style="background-color:${V3.surface};border:1px solid ${V3.border};border-radius:16px;">
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 14px;font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${V3.textTertiary};text-transform:uppercase;">First day checklist</p>
        ${checkItem('Set your display name and avatar', true)}
        ${checkItem('Add a signature for outgoing mail', false)}
        ${checkItem('Turn on two-factor authentication', false)}
        ${checkItem('Connect your calendar to start RSVPing', false)}
        ${checkItem('Install the desktop or mobile app', false)}
      </td>
    </tr>
  </table>`

  const body = `
    ${v3Eyebrow("You're in")}
    ${v3Spacer(22)}
    ${heroBlock}
    ${v3Spacer(22)}
    ${v3Paragraph(
      `You're now part of ${workspaceDomain}. Wistmail bundles the apps you use every day into a single, end-to-end encrypted workspace — no more juggling tabs, no more context switches.`,
    )}
    ${v3Spacer(28)}
    ${featureGrid}
    ${v3Spacer(20)}
    ${checklist}
    ${v3Spacer(28)}
    ${v3Button({ href: workspaceUrl, label: 'Open Wistmail' })}
  `

  const html = v3Layout({
    preheader: `Welcome to ${workspaceDomain}. Your Wistmail inbox is ready.`,
    fromAddress,
    body,
    centerBody: true,
  })

  const text = `You're in — Wistmail

Hi ${firstName},

You're now part of ${workspaceDomain}. Wistmail bundles the apps you use every
day into one end-to-end encrypted workspace.

WHAT'S INSIDE
  Mail      — focused inbox with smart triage and AI summaries.
  Chat      — DMs and team channels with the same login.
  Calendar  — schedule, RSVP and meet without leaving the app.
  Projects  — boards, tasks and docs that turn mail into action.

FIRST DAY CHECKLIST
  [x] Set your display name and avatar
  [ ] Add a signature for outgoing mail
  [ ] Turn on two-factor authentication
  [ ] Connect your calendar to start RSVPing
  [ ] Install the desktop or mobile app

OPEN WISTMAIL
  ${workspaceUrl}

— Wistfare Mail · ${fromAddress}`

  return { html, text }
}

function featureCard(glyph: string, title: string, desc: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="v3-surface" style="background-color:${V3.surface};border:1px solid ${V3.border};border-radius:14px;height:100%;">
    <tr>
      <td style="padding:18px;">
        <div style="width:36px;height:36px;border-radius:10px;background-color:${V3.accentDim};text-align:center;line-height:36px;font-family:${V3.fontMono};font-size:18px;color:${V3.accent};">${glyph}</div>
        <p class="v3-text-primary" style="margin:10px 0 6px;font-family:${V3.fontMono};font-size:14px;font-weight:700;color:${V3.textPrimary};">${escape(title)}</p>
        <p class="v3-text-secondary" style="margin:0;font-family:${V3.fontMono};font-size:11px;font-weight:500;color:${V3.textSecondary};line-height:1.5;">${escape(desc)}</p>
      </td>
    </tr>
  </table>`
}

function checkItem(label: string, checked: boolean): string {
  const box = checked
    ? `<div style="width:18px;height:18px;border-radius:5px;background-color:${V3.accent};text-align:center;line-height:18px;font-family:${V3.fontMono};font-weight:700;font-size:11px;color:${V3.textOnAccent};">✓</div>`
    : `<div style="width:18px;height:18px;border-radius:5px;background-color:${V3.bg};border:1.5px solid ${V3.border};">&nbsp;</div>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;">
    <tr>
      <td valign="middle" width="30" style="padding-right:12px;">${box}</td>
      <td valign="middle" class="v3-text-primary" style="font-family:${V3.fontMono};font-size:12px;font-weight:500;color:${V3.textPrimary};">${escape(label)}</td>
    </tr>
  </table>`
}
