'use client'

import Link from 'next/link'
import { Smartphone, Mail, ArrowRight, ArrowLeft } from 'lucide-react'

export default function TwoFactorSetupChooserPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/settings/two-factor"
          className="flex items-center gap-1.5 font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to two-factor
        </Link>
        <h1 className="text-2xl font-semibold text-wm-text-primary">Add a method</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Pick how you&apos;d like to receive your second factor.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <MethodCard
          href="/settings/two-factor/setup-totp"
          icon={<Smartphone className="h-5 w-5" />}
          title="Authenticator app"
          description="Use Google Authenticator, 1Password, or Authy. Recommended."
        />
        <MethodCard
          href="/settings/two-factor/setup-email"
          icon={<Mail className="h-5 w-5" />}
          title="Backup email"
          description="We&rsquo;ll send a 6-digit code to a different email when you sign in."
        />
      </div>
    </div>
  )
}

function MethodCard({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 border border-wm-border bg-wm-surface px-5 py-4 transition-colors hover:border-wm-accent"
    >
      <div className="flex h-10 w-10 items-center justify-center bg-wm-accent/10 text-wm-accent">
        {icon}
      </div>
      <div className="flex flex-1 flex-col">
        <p className="text-sm font-medium text-wm-text-primary">{title}</p>
        <p className="font-mono text-[11px] text-wm-text-tertiary">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-wm-text-muted" />
    </Link>
  )
}
