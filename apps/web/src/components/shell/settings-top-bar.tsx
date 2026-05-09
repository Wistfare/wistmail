'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SettingsTopBarProps {
  /** Left breadcrumb crumb — e.g. "SETTINGS" or "ADMIN". */
  scope: string
  /** Right breadcrumb crumb (lime, current page) — e.g. "ACCOUNT". */
  page: string
  /** Optional save action — when omitted the right side is empty. */
  onSave?: () => void
  saving?: boolean
  /** Override the save button label. Defaults to "SAVE CHANGES". */
  saveLabel?: string
  /** Optional right-side custom slot (e.g. invite-user CTA on Admin/Users). */
  rightSlot?: React.ReactNode
}

/**
 * Top breadcrumb bar — Pencil reference: `SettingsV3-Account.tBar`
 * (`s1lHW`) and `AdminV3-Overview.tBar` (analogue).
 *
 *   container: padding [20, 32], 1px bottom hairline #1A1A1A,
 *     justify between, alignItems center
 *   tbL (gap 10):
 *     "<scope>" 10/700 #6e6e6e tracking 1.5
 *     "/"       10/600 #404040
 *     "<page>"  10/700 lime tracking 1.5
 *   tbR:
 *     saveBtn — radius 18, padding [8,14], gap 6, lime fill, lime
 *       drop-shadow blur 14 #BFFF0040 offset y=3:
 *       check 13 black + "SAVE CHANGES" 11/700 black tracking 1
 */
export function SettingsTopBar({
  scope,
  page,
  onSave,
  saving,
  saveLabel = 'Save changes',
  rightSlot,
}: SettingsTopBarProps) {
  return (
    <div
      className="flex w-full items-center justify-between"
      style={{
        padding: '20px 32px',
        borderBottom: '1px solid var(--color-wm-border)',
      }}
    >
      <div className="flex min-w-0 items-center" style={{ gap: 10 }}>
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 10, letterSpacing: 1.5, color: '#6e6e6e' }}
        >
          {scope}
        </span>
        <span
          className="font-mono font-semibold"
          style={{ fontSize: 10, color: '#404040' }}
        >
          /
        </span>
        <span
          className="truncate font-mono font-bold uppercase text-wm-accent"
          style={{ fontSize: 10, letterSpacing: 1.5 }}
        >
          {page}
        </span>
      </div>
      {rightSlot ?? (
        onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={cn(
              'inline-flex items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover',
              saving ? 'cursor-wait opacity-60' : 'cursor-pointer',
            )}
            style={{
              gap: 6,
              padding: '8px 14px',
              borderRadius: 18,
              boxShadow: '0 3px 14px 0 rgba(191,255,0,0.25)',
              color: '#000000',
            }}
          >
            <Check style={{ width: 13, height: 13 }} />
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 11, letterSpacing: 1 }}
            >
              {saveLabel}
            </span>
          </button>
        )
      )}
    </div>
  )
}
