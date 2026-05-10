'use client'

import Link from 'next/link'
import {
  ChevronRight,
  KeyRound,
  Mail,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import {
  AuthCard,
  AuthHeading,
  AuthHeroIcon,
} from '@/components/auth'
import { cn } from '@/lib/utils'

/**
 * `/mfa/setup` — Pencil reference: `Screen/MFASetupV3-Choose` (`qne6O`).
 *
 * Method chooser shown when the user is enrolling a security factor for
 * the first time, OR after they pick "+ Add method" in /settings/two-factor.
 *
 * Card structure (gap 24, width 420):
 *   1. shieldFr  — 80×80 radius-20 lime ring (re-uses AuthHeroIcon)
 *   2. heading   — eyebrow "SECURITY · STEP 1" + title "Add a security factor"
 *      + description "Required for your account. Pick a method to start."
 *   3. methods   — three picker rows in a single bg-surface card with
 *      hairline dividers. The "Authenticator app" row is recommended;
 *      "Backup email" is the fallback; "Phone (SMS)" is rendered as
 *      "coming soon" so the layout matches the Pencil frame even though
 *      we don't ship SMS yet.
 *   4. footnote  — "You can change methods anytime in Settings."
 */
export default function MfaSetupChooserPage() {
  return (
    <AuthCard>
      <AuthHeroIcon>
        <ShieldCheck className="h-9 w-9" />
      </AuthHeroIcon>
      <AuthHeading
        eyebrow="Security · Step 1"
        title="Add a security factor"
        description="Required for your account. Pick a method to start."
      />

      <div
        className="w-full bg-wm-surface"
        style={{
          borderRadius: 12,
          padding: 6,
          border: '1px solid var(--color-wm-border)',
        }}
      >
        <MethodRow
          href="/mfa/setup/totp"
          icon={<Smartphone className="text-wm-accent" style={{ width: 16, height: 16 }} aria-hidden />}
          title="Authenticator app"
          description="Apple, Google Authenticator, 1Password, Authy, or any TOTP app."
          recommended
        />
        <Divider />
        <MethodRow
          href="/mfa/setup/email"
          icon={<Mail style={{ width: 16, height: 16, color: '#999999' }} aria-hidden />}
          title="Backup email"
          description="Send 6-digit codes to a second address."
        />
        <Divider />
        <MethodRow
          icon={<KeyRound style={{ width: 16, height: 16, color: '#6e6e6e' }} aria-hidden />}
          title="Phone (SMS)"
          description="Receive a text message at sign-in."
          comingSoon
        />
      </div>

      <p
        className="text-center font-mono"
        style={{ fontSize: 11, color: '#6e6e6e' }}
      >
        You can change methods anytime in Settings.
      </p>
    </AuthCard>
  )
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{ height: 1, background: 'var(--color-wm-border)' }}
    />
  )
}

/**
 * One row in the chooser card. Pencil `methodRow`:
 *   cornerRadius 8, padding [12, 12], gap 12, alignItems center
 *   [icon 16] [title 13/600 white + desc 11/500 #6e6e6e stack] [chevron 14 #6e6e6e]
 *
 * The recommended row gets a small "RECOMMENDED" lime pill next to the
 * title — Pencil's `recBadge` (radius 4, padding [2, 6], 9/700 lime
 * tracking 1.5, bg `wm-accent-dim`, 1px lime stroke).
 */
function MethodRow({
  href,
  icon,
  title,
  description,
  recommended,
  comingSoon,
}: {
  href?: string
  icon: React.ReactNode
  title: string
  description: string
  recommended?: boolean
  comingSoon?: boolean
}) {
  const inner = (
    <div
      className={cn(
        'flex items-center transition-colors',
        href && !comingSoon && 'hover:bg-wm-surface-hover',
        comingSoon && 'opacity-60',
      )}
      style={{ borderRadius: 8, padding: '12px 12px', gap: 12 }}
    >
      {icon}
      <div className="flex flex-1 flex-col" style={{ gap: 2 }}>
        <span className="flex items-center" style={{ gap: 8 }}>
          <span
            className="font-mono font-semibold text-wm-text-primary"
            style={{ fontSize: 13 }}
          >
            {title}
          </span>
          {recommended && (
            <span
              className="font-mono font-bold uppercase text-wm-accent"
              style={{
                fontSize: 9,
                letterSpacing: 1.5,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--color-wm-accent-dim)',
                border: '1px solid var(--color-wm-accent)',
              }}
            >
              Recommended
            </span>
          )}
          {comingSoon && (
            <span
              className="font-mono font-bold uppercase"
              style={{
                fontSize: 9,
                letterSpacing: 1.5,
                color: '#6e6e6e',
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--color-wm-border)',
              }}
            >
              Coming soon
            </span>
          )}
        </span>
        <span
          className="font-mono font-medium"
          style={{ fontSize: 11, color: '#6e6e6e' }}
        >
          {description}
        </span>
      </div>
      <ChevronRight
        aria-hidden
        style={{ width: 14, height: 14, color: '#6e6e6e' }}
      />
    </div>
  )
  if (href && !comingSoon) {
    return (
      <Link href={href} className="block cursor-pointer">
        {inner}
      </Link>
    )
  }
  return inner
}
