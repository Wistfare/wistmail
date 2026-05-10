/**
 * V3 transactional email: UserInvitation.
 *
 * Sent when an admin invites a new user to the workspace. Mirrors
 * `Email/V3-UserInvitation` in `design.lib.pen`.
 *
 * Replaces the V1 `invitation.ts` template (which lives alongside this file
 * during the migration window — see `routes/admin.ts` for the call site).
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
  escape,
} from './_v3-layout.js'

export interface UserInvitationParams {
  /** First name or full display name of the invitee. */
  displayName: string
  /** Email address being provisioned (e.g. sarah@wistmail.com). */
  newEmail: string
  /** Temporary password the user must change on first login. */
  tempPassword: string
  /** Workspace primary domain (e.g. wistmail.com). */
  workspaceDomain: string
  /** Display name of the inviter (e.g. "Veda Nsengimana"). */
  inviterName: string
  /** Absolute URL the user should hit to activate / sign in. */
  loginUrl: string
  /** Reply-to address used in the footer. */
  fromAddress: string
}

export function buildUserInvitationEmail(params: UserInvitationParams): {
  html: string
  text: string
} {
  const {
    displayName,
    newEmail,
    tempPassword,
    workspaceDomain,
    inviterName,
    loginUrl,
    fromAddress,
  } = params

  // First name only for the hero, matching the design ("Welcome aboard, Sarah.")
  const firstName = displayName.split(/\s+/)[0] ?? displayName

  const credCard = v3Card({
    variant: 'accent',
    inner: `
      <p style="margin:0 0 16px;font-family:${V3.fontMono};font-size:10px;font-weight:700;letter-spacing:2px;color:${V3.accent};text-transform:uppercase;">Your sign-in details</p>
      ${credRow('Email address', newEmail, false)}
      <div style="height:14px;font-size:0;line-height:14px;">&nbsp;</div>
      ${credRow('Temporary password', tempPassword, true)}
      <div style="height:14px;font-size:0;line-height:14px;">&nbsp;</div>
      ${credRow('Workspace', workspaceDomain, false)}
    `,
  })

  const securityCard = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${V3.bg};border:1px solid ${V3.border};border-radius:12px;">
    <tr>
      <td style="padding:14px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" width="24" style="padding-right:12px;color:${V3.accent};font-family:${V3.fontMono};font-weight:700;">⚿</td>
            <td valign="top">
              <p class="v3-text-tertiary" style="margin:0 0 4px;font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;color:${V3.textTertiary};text-transform:uppercase;">Security</p>
              <p class="v3-text-secondary" style="margin:0;font-family:${V3.fontMono};font-size:11px;font-weight:500;color:${V3.textSecondary};line-height:1.5;">
                Wistmail will never ask for your password by email. You'll be asked to set a new password the first time you sign in. Enable two-factor authentication right after.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`

  const aboutBlock = `<div>
    <p class="v3-text-tertiary" style="margin:0 0 8px;font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;color:${V3.textTertiary};text-transform:uppercase;">What is Wistmail?</p>
    <p class="v3-text-secondary" style="margin:0;font-family:${V3.fontMono};font-size:12px;font-weight:500;color:${V3.textSecondary};line-height:1.6;">
      One workspace for Mail, Chat, Calendar, Projects, Docs and Meetings — end-to-end encrypted, hosted in Africa, run by Wistfare.
    </p>
  </div>`

  const body = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td valign="middle" style="padding-right:8px;color:${V3.accent};font-family:${V3.fontMono};font-weight:700;">✦</td>
        <td valign="middle">${v3Eyebrow("You've been invited")}</td>
      </tr>
    </table>
    ${v3Spacer(20)}
    ${v3Hero({ line1: 'Welcome aboard,', line2: `${firstName}.` })}
    ${v3Spacer(20)}
    ${v3Paragraph(
      `${inviterName} invited you to join ${workspaceDomain} on Wistmail — a focused workspace for everything your team does in a day. Sign in with the credentials below; you'll set a new password right after.`,
    )}
    ${v3Spacer(28)}
    ${credCard}
    ${v3Spacer(28)}
    ${v3Button({ href: loginUrl, label: 'Activate account' })}
    ${v3Spacer(24)}
    ${securityCard}
    ${v3Spacer(20)}
    ${aboutBlock}
  `

  const html = v3Layout({
    preheader: `${inviterName} invited you to ${workspaceDomain}. Sign in with the credentials inside.`,
    fromAddress,
    body,
  })

  const text = `You've been invited to Wistmail

Hi ${firstName},

${inviterName} invited you to join ${workspaceDomain}.

YOUR SIGN-IN DETAILS
  Email:    ${newEmail}
  Password: ${tempPassword}
  Workspace: ${workspaceDomain}

ACTIVATE YOUR ACCOUNT
  ${loginUrl}

SECURITY
  Wistmail will never ask for your password by email. You'll be asked to set a
  new password the first time you sign in. Enable two-factor authentication
  right after.

WHAT IS WISTMAIL?
  One workspace for Mail, Chat, Calendar, Projects, Docs and Meetings —
  end-to-end encrypted, hosted in Africa.

— Wistfare Mail · ${fromAddress}`

  return { html, text }
}

function credRow(label: string, value: string, mono: boolean): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding-bottom:6px;font-family:${V3.fontMono};font-size:9px;font-weight:700;letter-spacing:1.5px;color:${V3.textTertiary};text-transform:uppercase;">${escape(label)}</td>
    </tr>
    <tr>
      <td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${V3.bg};border:1px solid ${V3.border};border-radius:10px;">
          <tr>
            <td style="padding:12px 14px;font-family:${V3.fontMono};font-size:${mono ? 15 : 13}px;font-weight:700;letter-spacing:${mono ? '1.5px' : 'normal'};color:${V3.textPrimary};">${escape(value)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`
}
