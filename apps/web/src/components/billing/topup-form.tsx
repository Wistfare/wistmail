'use client'

import { useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Button, InputField } from '@/components/ui'
import { cn, formatCents } from '@/lib/utils'

export type TopupMethod = 'mtn_momo' | 'airtel_money'

export interface TopupFormSubmitInput {
  amountCents: number
  method: TopupMethod
  msisdn: string
}

export interface TopupFormProps {
  /** Preset USD amounts. Default ladder mirrors the Pencil drawer (5/10/25/50/100). */
  presetCents?: number[]
  initialMethod?: TopupMethod
  /** Called when the user clicks confirm. The page wires this to /api/v1/billing/topup. */
  onSubmit?: (input: TopupFormSubmitInput) => void | Promise<void>
  /** When true, the confirm button shows a spinner. */
  submitting?: boolean
  /** Free-form error rendered below the button. */
  error?: string | null
  className?: string
}

const DEFAULT_PRESETS = [500, 1000, 2500, 5000, 10000]

/**
 * Top-up form. Pencil reference: `Top up wallet` drawer (`W2Hdlo`).
 *
 * The Pencil shows this as a side drawer; we render the same vertical
 * stack so it can host either inline (the dedicated topup page) or
 * inside a Modal/Drawer later without changing the component contract.
 *
 * Validation matches the API: amountCents > 0, msisdn 9–15 digits, one of
 * the two supported methods. The component refuses to call onSubmit until
 * the inputs are valid — the page doesn't have to re-derive this.
 */
export function TopupForm({
  presetCents = DEFAULT_PRESETS,
  initialMethod = 'mtn_momo',
  onSubmit,
  submitting,
  error,
  className,
}: TopupFormProps) {
  const [amountCents, setAmountCents] = useState<number>(presetCents[2] ?? 2500)
  const [customAmount, setCustomAmount] = useState('')
  const [method, setMethod] = useState<TopupMethod>(initialMethod)
  const [msisdn, setMsisdn] = useState('')

  const trimmedMsisdn = msisdn.replace(/\D/g, '')
  const validMsisdn = /^\d{9,15}$/.test(trimmedMsisdn)
  const validAmount = amountCents > 0
  const canSubmit = validAmount && validMsisdn && !submitting

  const onConfirm = async () => {
    if (!canSubmit) return
    await onSubmit?.({ amountCents, method, msisdn: trimmedMsisdn })
  }

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
          Amount
        </span>
        <div className="flex flex-wrap gap-2">
          {presetCents.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setAmountCents(c)
                setCustomAmount('')
              }}
              className={cn(
                'border px-4 py-2 font-mono text-[12px] transition-colors',
                amountCents === c && customAmount === ''
                  ? 'border-wm-accent bg-wm-accent-dim text-wm-accent'
                  : 'border-wm-border text-wm-text-secondary hover:border-wm-text-tertiary',
              )}
            >
              {formatCents(c)}
            </button>
          ))}
        </div>
        <InputField
          label="Custom amount (USD)"
          type="number"
          inputMode="decimal"
          min={1}
          placeholder="0.00"
          value={customAmount}
          onChange={(e) => {
            const v = e.target.value
            setCustomAmount(v)
            const parsed = parseFloat(v)
            if (Number.isFinite(parsed) && parsed > 0) {
              setAmountCents(Math.round(parsed * 100))
            } else {
              setAmountCents(0)
            }
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
          Payment method
        </span>
        <div className="flex flex-col gap-2">
          {(
            [
              { id: 'mtn_momo', label: 'MTN MoMo', tone: 'border-[#FFCB05]' },
              { id: 'airtel_money', label: 'Airtel Money', tone: 'border-[#FF1A1A]' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className={cn(
                'flex items-center gap-3 border px-4 py-3 text-left transition-colors',
                method === m.id
                  ? 'border-wm-accent bg-wm-accent-dim'
                  : 'border-wm-border hover:border-wm-text-tertiary',
              )}
            >
              <Smartphone
                className={cn(
                  'h-4 w-4',
                  method === m.id ? 'text-wm-accent' : 'text-wm-text-muted',
                )}
              />
              <span
                className={cn(
                  'font-mono text-[13px]',
                  method === m.id ? 'text-wm-accent' : 'text-wm-text-secondary',
                )}
              >
                {m.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <InputField
        label="Mobile number"
        type="tel"
        inputMode="tel"
        placeholder="2507XXXXXXXX"
        value={msisdn}
        onChange={(e) => setMsisdn(e.target.value)}
        hint="Country code + number, digits only"
      />

      <div className="flex flex-col gap-3 border-t border-wm-border pt-5">
        <div className="flex items-center justify-between font-mono text-[12px]">
          <span className="text-wm-text-tertiary">Top-up amount</span>
          <span className="text-wm-text-primary">
            {formatCents(amountCents)}
          </span>
        </div>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={!canSubmit}
          loading={submitting}
        >
          Confirm top-up
        </Button>
        {error && (
          <p className="font-mono text-[11px] text-wm-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
