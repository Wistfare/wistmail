'use client'

import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  RefreshCw,
  RotateCcw,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn, formatCents, formatRelativeTime } from '@/lib/utils'

export type TransactionReason =
  | 'topup'
  | 'renewal_charge'
  | 'refund'
  | 'adjustment'
  | 'trial_credit'
  | 'chargeback'
  | string

export interface TransactionRowProps {
  amountCents: number
  balanceAfterCents?: number
  reason: TransactionReason
  createdAt: string | Date
  note?: string | null
  /** Optional invoice/receipt URL. When supplied, an icon links to it. */
  receiptUrl?: string | null
  className?: string
}

/**
 * Single ledger row. Pencil reference: the rows under `wallet` in the
 * billing overview (`FHgAk`) and the invoice table on `ryBKw`.
 *
 * The amount renders with a leading + or − so credits and debits are
 * scannable at a glance; lime when positive, dim when negative.
 */
const reasonLabel: Record<string, string> = {
  topup: 'Top up',
  renewal_charge: 'Renewal',
  refund: 'Refund',
  adjustment: 'Adjustment',
  trial_credit: 'Trial credit',
  chargeback: 'Chargeback',
}

const reasonIcon: Record<string, LucideIcon> = {
  topup: ArrowDownLeft,
  renewal_charge: RefreshCw,
  refund: RotateCcw,
  adjustment: Wrench,
  trial_credit: Gift,
  chargeback: ArrowUpRight,
}

export function TransactionRow({
  amountCents,
  reason,
  createdAt,
  note,
  receiptUrl,
  className,
}: TransactionRowProps) {
  const Icon = reasonIcon[reason] ?? ArrowUpRight
  const label = reasonLabel[reason] ?? reason
  const isCredit = amountCents > 0
  const isZero = amountCents === 0
  const sign = isCredit ? '+' : isZero ? '' : '−'
  const date =
    typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  return (
    <div
      className={cn(
        'flex items-center gap-4 border-b border-wm-border px-5 py-3 last:border-b-0',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-7 w-7 items-center justify-center',
          isCredit ? 'bg-wm-accent-dim text-wm-accent' : 'bg-wm-bg text-wm-text-tertiary',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-[12px] font-medium text-wm-text-primary">
          {label}
          {note && (
            <span className="ml-2 text-wm-text-tertiary">— {note}</span>
          )}
        </span>
        <span className="font-mono text-[10px] text-wm-text-tertiary">
          {formatRelativeTime(date)}
        </span>
      </div>
      <span
        className={cn(
          'shrink-0 font-mono text-[13px] font-semibold tabular-nums',
          isCredit ? 'text-wm-accent' : isZero ? 'text-wm-text-tertiary' : 'text-wm-text-primary',
        )}
      >
        {sign}
        {formatCents(Math.abs(amountCents))}
      </span>
      {receiptUrl ? (
        <a
          href={receiptUrl}
          className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary hover:text-wm-accent"
        >
          PDF
        </a>
      ) : null}
    </div>
  )
}
