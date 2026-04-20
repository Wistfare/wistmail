'use client'

/// Minimal toast surface with native undo affordance. We roll our own
/// instead of pulling Sonner / react-hot-toast because (a) the whole
/// UI language is already one file — sharp corners, mono meta —
/// which third-party toast libs fight, and (b) we need the Undo
/// button to participate in the same TanStack mutation graph that
/// the rest of the inbox uses, which is cleaner with a straight
/// context.
///
/// Toasts auto-dismiss after `UNDO_WINDOW_MS`; any `undo` handler
/// fires before dismissal if the user taps the action button.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const UNDO_WINDOW_MS = 6000

export interface ToastOptions {
  message: string
  /// Optional reverse action. When provided we render an "Undo"
  /// button; the handler runs immediately on click and we dismiss
  /// the toast. Fire-and-forget — errors bubble to console.
  undo?: () => Promise<void> | void
  /// Override the auto-dismiss window. Defaults to 6s.
  durationMs?: number
}

interface ToastRow extends ToastOptions {
  id: number
}

interface ToastContextValue {
  show: (opts: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<ToastRow[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const show = useCallback<ToastContextValue['show']>(
    (opts) => {
      const id = nextId.current++
      setRows((prev) => [...prev, { ...opts, id }])
      const duration = opts.durationMs ?? UNDO_WINDOW_MS
      setTimeout(() => dismiss(id), duration)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Stacked container, bottom-left so it doesn't collide with
          the FAB-adjacent compose area. */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-[70] flex flex-col gap-2">
        {rows.map((row) => (
          <ToastCard key={row.id} row={row} onDismiss={() => dismiss(row.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({
  row,
  onDismiss,
}: {
  row: ToastRow
  onDismiss: () => void
}) {
  // Tiny enter animation — translate + fade — that doesn't need
  // framer-motion.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-3 border border-wm-border bg-wm-surface px-3 py-2 font-mono text-[11px] shadow-lg transition-all duration-150',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      <span className="text-wm-text-primary">{row.message}</span>
      {row.undo && (
        <button
          type="button"
          onClick={async () => {
            try {
              await row.undo!()
            } catch (err) {
              console.error('[toast] undo failed:', err)
            } finally {
              onDismiss()
            }
          }}
          className="cursor-pointer border border-wm-accent/40 bg-wm-accent/10 px-2 py-0.5 font-semibold uppercase text-wm-accent hover:bg-wm-accent/20"
        >
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
        aria-label="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return ctx
}
