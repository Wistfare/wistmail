'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  /** Optional footer area (typically buttons). */
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** When false, clicking the backdrop will not dismiss. Useful for forms. */
  dismissOnBackdrop?: boolean
  className?: string
}

const sizeStyles = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

/**
 * Centered modal dialog. Pencil pattern: dark surface (#111), 1px #1A1A1A
 * border, no rounded corners, lime accent on actions.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissOnBackdrop = true,
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // prevent background scroll
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => dismissOnBackdrop && onClose()}
        aria-hidden
      />
      <div
        className={cn(
          'relative flex w-full flex-col border border-wm-border bg-wm-surface shadow-2xl',
          sizeStyles[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-wm-border px-6 py-5">
            <div className="flex flex-col gap-1">
              {title && (
                <h2 id="modal-title" className="text-base font-semibold text-wm-text-primary">
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-description" className="font-mono text-xs text-wm-text-tertiary">
                  {description}
                </p>
              )}
            </div>
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
        <div className="flex-1 px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-wm-border px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
