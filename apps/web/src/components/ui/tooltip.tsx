'use client'

import { cloneElement, isValidElement, useId, useState } from 'react'
import { cn } from '@/lib/utils'

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

const sideStyles: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
}

/**
 * Hover/focus tooltip. Lightweight; no Radix dep. Wrap a single React
 * element child. The trigger is decorated with `aria-describedby` so
 * screen readers pick it up.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)

  if (!isValidElement(children)) {
    throw new Error('<Tooltip> requires a single React element child')
  }

  const trigger = cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
    'aria-describedby': id,
  })

  return (
    <span className="relative inline-flex">
      {trigger}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap border border-wm-border bg-wm-surface px-2 py-1 font-mono text-[11px] text-wm-text-primary shadow-lg',
            sideStyles[side],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
