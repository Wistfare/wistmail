'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Tag, X } from 'lucide-react'
import {
  useLabels,
  useLabelsForEmail,
  useSetLabelsForEmail,
  type Label,
} from '@/lib/labels'
import { cn } from '@/lib/utils'

interface LabelAssignPopoverProps {
  emailId: string
  /// Anchor button rendered by the parent. We don't render it
  /// ourselves so the parent can place the trigger anywhere in
  /// the email-detail header.
  trigger: React.ReactNode
}

/// Multi-select label picker shown in a popover above the trigger.
/// Tapping a label toggles assignment; the change syncs immediately
/// to /labels/email/:id via PUT.
export function LabelAssignPopover({ emailId, trigger }: LabelAssignPopoverProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Click-outside to dismiss.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-64 border border-wm-border bg-wm-surface shadow-lg">
          <Picker emailId={emailId} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

function Picker({
  emailId,
  onClose,
}: {
  emailId: string
  onClose: () => void
}) {
  const all = useLabels()
  const assigned = useLabelsForEmail(emailId)
  const setLabels = useSetLabelsForEmail()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (assigned.data) setSelected(new Set(assigned.data.map((l) => l.id)))
  }, [assigned.data])

  function toggle(label: Label) {
    const next = new Set(selected)
    if (next.has(label.id)) next.delete(label.id)
    else next.add(label.id)
    setSelected(next)
    // Optimistic — fire the PUT immediately so the inbox row label
    // dots update without waiting for the user to close the popover.
    setLabels.mutate({ emailId, labelIds: [...next] })
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-wm-border px-3 py-2">
        <p className="font-mono text-[11px] uppercase text-wm-text-muted">
          Apply labels
        </p>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {all.isPending ? (
        <p className="px-3 py-3 font-mono text-[11px] text-wm-text-muted">
          Loading…
        </p>
      ) : !all.data || all.data.length === 0 ? (
        <p className="px-3 py-3 font-mono text-[11px] text-wm-text-muted">
          No labels yet — create one in Settings → Labels.
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto py-1">
          {all.data.map((label) => {
            const isSelected = selected.has(label.id)
            return (
              <li key={label.id}>
                <button
                  type="button"
                  onClick={() => toggle(label)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                    isSelected
                      ? 'bg-wm-surface-hover'
                      : 'hover:bg-wm-surface-hover',
                  )}
                >
                  <span
                    className="h-3 w-3 shrink-0"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="flex-1 truncate text-[13px] text-wm-text-primary">
                    {label.name}
                  </span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 text-wm-accent" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Dummy reference so unused-import lint stays quiet on the icon
// when consumers compose the trigger themselves.
void Tag
