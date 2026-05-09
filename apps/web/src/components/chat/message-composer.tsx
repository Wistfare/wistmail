'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Paperclip, Send, Smile, Sparkles } from 'lucide-react'
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
 * V3 chat composer — Pencil reference: `ChatViewV3.composer` (`kPc6V`).
 *
 *   container: padding [12, 20, 16, 20], 1px top hairline #1A1A1A
 *   cmpBox (`NPOQP`): radius 24, bg #111111, 1px #1A1A1A border,
 *     padding [6, 8, 6, 16], gap 8, alignItems center
 *     left  → 32 round transparent button (paperclip 14 #999999)
 *     middle → input — placeholder 13/500 #6e6e6e
 *     right → 32 round transparent buttons (sparkles, smile, mic) +
 *             36×36 lime round Send button (radius 18, send icon 13 black)
 *
 * Auto-grows up to ~140-px scroll height before the textarea starts
 * scrolling internally. Enter sends, Shift+Enter newlines.
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

  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(140, ta.scrollHeight)}px`
  }, [value])

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  const remaining = maxLength - value.length
  const showCount = remaining < 200
  const empty = value.trim().length === 0

  return (
    <div
      className={cn('flex w-full flex-col', className)}
      style={{
        padding: '12px 20px 16px 20px',
        gap: 10,
        borderTop: '1px solid var(--color-wm-border)',
      }}
    >
      <div
        className="flex w-full items-center"
        style={{
          padding: '6px 8px 6px 16px',
          gap: 8,
          background: '#111111',
          border: '1px solid #1A1A1A',
          borderRadius: 24,
        }}
      >
        {/* Left attach button */}
        <div className="flex items-center" style={{ gap: 4 }}>
          {leadingActions}
          <CmpIc label="Attach file">
            <Paperclip style={{ width: 14, height: 14 }} />
          </CmpIc>
        </div>

        {/* Input — flex-grow */}
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
          className="flex-1 resize-none bg-transparent font-mono outline-none placeholder:text-wm-text-muted"
          style={{
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.4,
            color: '#FFFFFF',
            // Default 1-line height matches Pencil cmpBox 36 - padding 12 = 24 visible.
            minHeight: 20,
            maxHeight: 140,
          }}
        />

        {showCount && (
          <span
            className="font-mono"
            style={{
              fontSize: 10,
              color:
                remaining < 0
                  ? 'var(--color-wm-error)'
                  : remaining < 50
                    ? 'var(--color-wm-warning)'
                    : '#6e6e6e',
            }}
          >
            {remaining}
          </span>
        )}

        {/* Right action stack */}
        <div className="flex items-center" style={{ gap: 4 }}>
          <CmpIc label="AI suggest">
            <Sparkles
              style={{ width: 14, height: 14, color: 'var(--color-wm-accent)' }}
            />
          </CmpIc>
          <CmpIc label="Emoji">
            <Smile style={{ width: 14, height: 14 }} />
          </CmpIc>
          <CmpIc label="Voice message">
            <Mic style={{ width: 14, height: 14 }} />
          </CmpIc>
          <button
            type="button"
            onClick={submit}
            disabled={disabled || sending || empty}
            aria-label="Send message"
            className={cn(
              'flex shrink-0 items-center justify-center transition-colors',
              empty || disabled
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer hover:bg-wm-accent-hover',
            )}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: 'var(--color-wm-accent)',
              color: '#000000',
            }}
          >
            {sending ? (
              <svg
                className="animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                style={{ width: 14, height: 14 }}
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <Send style={{ width: 13, height: 13 }} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/// Pencil composer icon button (`Vcmyv`/`GoEhC`/`KTbEM`/`TDzqb`):
/// 32×32 transparent round-square (radius 16), 14-px lucide glyph
/// at #999999 — hover lifts to white.
function CmpIc({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="flex cursor-pointer items-center justify-center text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
      style={{ width: 32, height: 32, borderRadius: 16 }}
    >
      {children}
    </button>
  )
}
