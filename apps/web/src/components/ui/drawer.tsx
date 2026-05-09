'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  side?: 'right' | 'left' | 'bottom'
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Width when side is left/right; height when bottom. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const widthStyles = {
  sm: 'w-80',
  md: 'w-[28rem]',
  lg: 'w-[32rem]',
  xl: 'w-[40rem]',
}

const heightStyles = {
  sm: 'h-64',
  md: 'h-96',
  lg: 'h-[32rem]',
  xl: 'h-[40rem]',
}

/**
 * Slide-in drawer. Used for taskDrawer, compose-as-drawer, settings panels
 * on small viewports. Pencil reference: `Mxst9` taskDrawer screen.
 */
export function Drawer({
  open,
  onClose,
  side = 'right',
  title,
  children,
  footer,
  size = 'md',
  className,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const sideStyle =
    side === 'right'
      ? cn('top-0 right-0 h-full border-l', widthStyles[size])
      : side === 'left'
        ? cn('top-0 left-0 h-full border-r', widthStyles[size])
        : cn('left-0 right-0 bottom-0 w-full border-t', heightStyles[size])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'drawer-title' : undefined}
      className="fixed inset-0 z-50"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className={cn(
          'absolute flex flex-col border-wm-border bg-wm-surface shadow-2xl',
          sideStyle,
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between gap-4 border-b border-wm-border px-5 py-4">
            <h2 id="drawer-title" className="text-sm font-semibold text-wm-text-primary">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-wm-border px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
