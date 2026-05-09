'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthHeroIcon,
} from '@/components/auth'

/** Pencil reference: `SetupV3-Done` (`Z8tTv`). */
export function StepDone({ domain }: { domain?: string }) {
  const router = useRouter()
  return (
    <AuthCard className="items-center text-center">
      <AuthHeroIcon variant="solid">
        <Check className="h-14 w-14" strokeWidth={3} />
      </AuthHeroIcon>
      <AuthHeading
        eyebrow="Setup complete"
        title="You're all set!"
        description={
          domain
            ? `Your email infrastructure is ready. Start sending and receiving with ${domain}.`
            : 'Your email infrastructure is ready. Start sending and receiving.'
        }
      />

      <dl className="flex w-full items-stretch justify-center gap-5 pt-2 font-mono text-[11px]">
        <DoneStat value="DKIM" label="Signed" />
        <Divider />
        <DoneStat value="SPF" label="Aligned" />
        <Divider />
        <DoneStat value="DMARC" label="Enforced" />
      </dl>

      <AuthButton onClick={() => router.push('/inbox')} trailingIcon={<ArrowRight className="h-4 w-4" />}>
        Go to inbox
      </AuthButton>
    </AuthCard>
  )
}

function DoneStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <dt className="font-mono text-[16px] font-bold text-wm-accent">{value}</dt>
      <dd className="font-mono text-[10px] uppercase tracking-[1.5px] text-wm-text-tertiary">
        {label}
      </dd>
    </div>
  )
}

function Divider() {
  return <span aria-hidden className="h-9 w-px self-center bg-wm-border" />
}
