'use client'

import Link from 'next/link'
import { ArrowUpRight, Wallet as WalletIcon } from 'lucide-react'
import { cn, formatCents } from '@/lib/utils'

export interface WalletCardProps {
  balanceCents: number
  currency?: string
  /** Renders an inline auto-renew pill on the right side of the header. */
  autoRenew?: boolean
  /** Render the "TOP UP WALLET" CTA. Defaults to /admin/billing/topup. */
  topUpHref?: string
  /** Additional class names — used to size the card inside grids. */
  className?: string
}

/**
 * Pencil reference: `wallet` panel inside `AdminV3-Plan-and-usage` (`FHgAk`).
 *
 * Big wallet number, lime auto-renew toggle pill on the right, and a single
 * lime CTA below. The Pencil shows a transactions strip beneath this card —
 * we leave that to the parent because different routes show different
 * subsets (overview shows 3 rows; the invoices page shows the full list).
 */
export function WalletCard({
  balanceCents,
  currency = 'USD',
  autoRenew,
  topUpHref = '/admin/billing/topup',
  className,
}: WalletCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col border border-wm-border bg-wm-surface',
        className,
      )}
    >
      <div className="flex items-center justify-between px-6 pt-5">
        <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-muted">
          <WalletIcon className="h-3.5 w-3.5" />
          <span>Wallet</span>
        </div>
        {autoRenew !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px]',
              autoRenew
                ? 'bg-wm-accent-dim text-wm-accent'
                : 'border border-wm-border text-wm-text-tertiary',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                autoRenew ? 'bg-wm-accent' : 'bg-wm-text-muted',
              )}
            />
            Auto-renew {autoRenew ? 'on' : 'off'}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 px-6 py-4">
        <span className="font-mono text-[40px] font-bold leading-none text-wm-text-primary">
          {formatCents(balanceCents, currency)}
        </span>
        <span className="font-mono text-[11px] text-wm-text-tertiary">
          Available balance
        </span>
      </div>

      <div className="border-t border-wm-border">
        <Link
          href={topUpHref}
          className="flex items-center justify-center gap-2 px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-accent transition-colors hover:bg-wm-accent-dim"
        >
          Top up wallet
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
