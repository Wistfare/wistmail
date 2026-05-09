'use client'

import { useEffect, useRef, useState } from 'react'
import { AtSign, Paperclip, Send, Smile } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface MessageComposerProps {
  placeholder?: string
  /** Called when the user submits (Enter or send button). */
  onSend: (content: string) => Promise<void> | void
  onTyping?: (typing: boolean) => void
  /** Initial draft content (e.g. resuming a per-conversation draft). */
  initialValue?: string
  disabled?: boolean
  /** Maximum characters; the composer surfaces the count when nearing it. */
  maxLength?: number
  /** Optional left-side action (e.g. attachment toggle). */
  leadingActions?: React.ReactNode
  className?: string
}

const TYPING_DEBOUNCE_MS = 1500

/**
 * V3 chat composer. Auto-grows up to ~160px, then scrolls.
 *
 * Pencil reference: `ChatViewV3` composer bar — input field with
 * mention/attachment/emoji actions on the left and a lime Send button on
 * the right when content is non-empty.
 */
export function MessageComposer({
  placeholder = 'Message',
  onSend,
  onTyping,
  initialValue = '',
  disabled,
  maxLength = 4000,
  leadingActions,
  className,
}: MessageComposerProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [value, setValue] = useState(initialValue)
  const [sending, setSending] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-resize the textarea based on its scroll height.
  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(160, ta.scrollHeight)}px`
  }, [value])

  // Reset to the initial value when the prop changes (e.g. switching
  // conversation). The hook also flushes the typing debounce.
  useEffect(() => {
    setValue(initialValue)
    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current)
    }
  }, [initialValue])

  function emitTyping() {
    if (!onTyping) return
    onTyping(true)
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => onTyping(false), TYPING_DEBOUNCE_MS)
  }

  async function submit() {
    const content = value.trim()
    if (!content || sending || disabled) return
    setSending(true)
    try {
      await onSend(content)
      setValue('')
      onTyping?.(false)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline (standard chat affordance).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  const remaining = maxLength - value.length
  const showCount = remaining < 200

  return (
    <div
      className={cn(
        'flex items-end gap-2 border-t border-wm-border bg-wm-bg px-4 py-3',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-0.5 text-wm-text-muted">
        {leadingActions}
        <IconButton aria-label="Attach file" size="sm">
          <Paperclip className="h-4 w-4" />
        </IconButton>
        <IconButton aria-label="Mention" size="sm">
          <AtSign className="h-4 w-4" />
        </IconButton>
        <IconButton aria-label="Emoji" size="sm">
          <Smile className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex flex-1 items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value)
            emitTyping()
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          className="min-h-[40px] flex-1 resize-none rounded-md border border-wm-border bg-wm-surface px-3 py-2 font-sans text-[13px] leading-[1.4] text-wm-text-primary outline-none placeholder:text-wm-text-muted focus:border-wm-accent"
        />
        {showCount && (
          <span
            className={cn(
              'pb-2 font-mono text-[10px]',
              remaining < 0
                ? 'text-wm-error'
                : remaining < 50
                  ? 'text-wm-warning'
                  : 'text-wm-text-tertiary',
            )}
          >
            {remaining}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={disabled || sending || value.trim().length === 0}
        aria-label="Send message"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors',
          value.trim().length === 0 || disabled
            ? 'cursor-not-allowed border border-wm-border bg-wm-surface text-wm-text-muted'
            : 'cursor-pointer bg-wm-accent text-wm-text-on-accent hover:bg-wm-accent-hover',
        )}
      >
        {sending ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
