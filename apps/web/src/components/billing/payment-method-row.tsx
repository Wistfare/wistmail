'use client'

import { Smartphone } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'

export type PaymentMethodKind = 'mtn_momo' | 'airtel_money' | string

export interface PaymentMethodRowProps {
  method: PaymentMethodKind
  msisdn: string
  lastUsedAt?: string | Date | null
  attempts?: number
  /** Render a "default" pill when this method is the workspace default. */
  isDefault?: boolean
  className?: string
}

const methodLabel: Record<string, string> = {
  mtn_momo: 'MTN MoMo',
  airtel_money: 'Airtel Money',
}

/** Mask all but the last 4 digits, e.g. 250788000000 → •••• •• 0000. */
function maskMsisdn(msisdn: string): string {
  if (msisdn.length <= 4) return msisdn
  return `•••• •• ${msisdn.slice(-4)}`
}

/**
 * Single saved-payment-method row. Pencil reference: `Payment methods`
 * panel inside `AdminV3-Plan-and-usage` (`FHgAk`) plus the per-card
 * detail in `o4uBd`.
 */
export function PaymentMethodRow({
  method,
  msisdn,
  lastUsedAt,
  attempts,
  isDefault,
  className,
}: PaymentMethodRowProps) {
  const label = methodLabel[method] ?? method
  const lastUsed =
    lastUsedAt instanceof Date
      ? lastUsedAt
      : lastUsedAt
      ? new Date(lastUsedAt)
      : null
  return (
    <div
      className={cn(
        'flex items-center gap-4 border border-wm-border bg-wm-surface px-5 py-4',
        className,
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center bg-wm-bg">
        <Smartphone className="h-4 w-4 text-wm-text-secondary" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-wm-text-primary">
            {label}
          </span>
          {isDefault && (
            <span className="bg-wm-accent-dim px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-wm-accent">
              Default
            </span>
          )}
        </div>
        <span className="font-mono text-[11px] text-wm-text-tertiary">
          {maskMsisdn(msisdn)}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-[10px] text-wm-text-tertiary">
        {lastUsed && <span>Last used {formatRelativeTime(lastUsed)}</span>}
        {typeof attempts === 'number' && attempts > 0 && (
          <span>
            {attempts} attempt{attempts === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  )
}
