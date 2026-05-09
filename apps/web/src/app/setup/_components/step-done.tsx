'use client'

import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * `/setup` step 4 — Pencil reference: `Screen/SetupV3-Done` (`Z8tTv`).
 *
 * formPane (justifyContent center, gap 32 vertical, alignItems center):
 *   heroIc: 120×120, radius 30, fill lime, check icon 60×60 black,
 *     drop-shadow blur 48 #BFFF0066 offset y=8
 *   heroT (gap 10 vertical):
 *     "SETUP COMPLETE" 11/700 lime tracking 2
 *     "You're all set!" 38/700 white
 *     desc 13/500 #6e6e6e centered line-height 1.6 fixed-width
 *   statsRow (gap 20 horizontal, justify center, padding [8, 0]):
 *     stat (gap 4 vertical, alignItems center):
 *       value 24/700 lime
 *       label 9/700 #6e6e6e tracking 1.5
 *     vertical 1px hairline #1A1A1A 36 high
 *     stat
 *     hairline
 *     stat
 *
 * Once shown, the user usually wants a CTA to continue — Pencil's
 * frame is static, but the design intent is "you're done". We add a
 * single "Go to inbox" lime CTA below the stats row to give the user
 * a visible next step.
 */
export function StepDone({ domain }: { domain?: string }) {
  const router = useRouter()
  return (
    <div
      className="mx-auto flex w-full max-w-[520px] flex-col items-center text-center"
      style={{ gap: 32 }}
    >
      {/* heroIc */}
      <div
        className="flex items-center justify-center bg-wm-accent"
        style={{
          width: 120,
          height: 120,
          borderRadius: 30,
          boxShadow: '0 8px 48px 0 rgba(191,255,0,0.4)',
        }}
      >
        <Check
          aria-hidden
          style={{ width: 60, height: 60, color: '#000000' }}
          strokeWidth={3}
        />
      </div>

      {/* heroT */}
      <div className="flex w-full flex-col items-center" style={{ gap: 10 }}>
        <p
          className="font-mono font-bold uppercase text-wm-accent"
          style={{ fontSize: 11, letterSpacing: 2 }}
        >
          Setup complete
        </p>
        <h1
          className="font-mono font-bold leading-tight text-wm-text-primary"
          style={{ fontSize: 38 }}
        >
          You&rsquo;re all set!
        </h1>
        <p
          className="font-mono font-medium"
          style={{ fontSize: 13, lineHeight: 1.6, color: '#6e6e6e' }}
        >
          Your email infrastructure is ready.
          <br />
          Start sending and receiving with {domain ?? 'your domain'}.
        </p>
      </div>

      {/* statsRow */}
      <div
        className="flex w-full items-center justify-center"
        style={{ gap: 20, padding: '8px 0' }}
      >
        <Stat value="4" label="DNS records" />
        <Divider />
        <Stat value="1" label="Domain" />
        <Divider />
        <Stat value="E2E" label="Encrypted" />
      </div>

      {/* CTA — design is static, but a "Go to inbox" link makes the
          screen actionable in production. Same lime button shape used
          across the wizard. */}
      <button
        type="button"
        onClick={() => router.push('/inbox')}
        className={cn(
          'flex w-full cursor-pointer items-center justify-center font-mono font-bold uppercase',
          'bg-wm-accent text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover',
        )}
        style={{
          height: 50,
          borderRadius: 12,
          fontSize: 12,
          letterSpacing: 2,
          boxShadow: '0 6px 24px 0 rgba(191,255,0,0.25)',
        }}
      >
        Go to inbox
      </button>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 4 }}>
      <span
        className="font-mono font-bold text-wm-accent"
        style={{ fontSize: 24 }}
      >
        {value}
      </span>
      <span
        className="font-mono font-bold uppercase"
        style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
      >
        {label}
      </span>
    </div>
  )
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{ width: 1, height: 36, background: 'var(--color-wm-border)' }}
    />
  )
}
