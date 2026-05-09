'use client'

import { useState } from 'react'
import {
  AlarmClock,
  Forward,
  Paperclip,
  Reply,
  ReplyAll,
  Send,
  Signature,
  Smile,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/// Pencil reference: `Components/V3-ComposerVariants` (`ZXFjE`).
/// Four variants of the inline reply / forward composer that lives at
/// the bottom of the thread reading pane (Pencil `Screen/InboxV3-Thread`
/// `composerWrap`).  All four share the same chrome — width 600,
/// cornerRadius 14, fill #111111, 2px LIME border, drop-shadow blur 24
/// #BFFF001A — and only differ in the eyebrow + which field rows
/// render above the body.

export type InlineComposerMode = 'reply' | 'reply-all' | 'forward'

export interface RecipientChip {
  email: string
  name?: string | null
}

export interface InlineComposerProps {
  mode: InlineComposerMode
  /// Recipients pre-populated by the caller (Reply: just the original
  /// sender; Reply All: sender + cc'd people; Forward: empty so the
  /// user fills it in).
  to: RecipientChip[]
  cc?: RecipientChip[]
  bcc?: RecipientChip[]
  /// Forward-only: prefilled subject ("Fwd: <original subject>").
  subject?: string
  /// Initial body — quoted reply / forwarded original. The user can
  /// edit on top.
  initialBody?: string
  /// Closes the composer without sending. Inbox unmounts the component.
  onCancel: () => void
  /// Called when the user clicks SEND. Returns a promise so the
  /// component can show a sending state and surface errors.
  onSend: (input: {
    to: RecipientChip[]
    cc?: RecipientChip[]
    bcc?: RecipientChip[]
    subject?: string
    body: string
  }) => Promise<void> | void
}

/**
 * Inline composer rendered inside a thread reading pane.  Replaces
 * the floating compose popup for reply / reply-all / forward — the
 * popup now only appears for the "+ NEW" → "New email" creation flow
 * (Pencil `Screen/ComposeV3-Signature`).
 *
 *   container
 *     cornerRadius 14, fill #111111, 2px LIME border,
 *     drop-shadow blur 24 #BFFF001A
 *
 *   eyebrow (`vXEy`, padding [12,16,8,16], gap 8)
 *     reply       → reply icon 13 lime + "REPLY"
 *     reply-all   → reply-all icon 13 lime + "REPLY ALL · N RECIPIENTS"
 *     forward     → forward icon 13 lime + "FORWARD"
 *
 *   field rows (1px bottom #1A1A1A, padding [10|12, 16], gap 10)
 *     label       11/700 #6e6e6e tracking 1
 *     content     chip(s) / input
 *     reply       → To row only
 *     reply-all   → To row (multiple chips), no Cc/Bcc by default
 *                   — the "+Cc/Bcc" reveal toggles those rows on
 *                   demand to match Pencil B-ReplyWithCcBcc
 *     forward     → To row + Subject row
 *
 *   body (`vXBody`, padding [16,18,18,18])
 *     text 13/500 white lineHeight 1.7
 *
 *   footer (`vXFt`, padding [12,16], 1px top #1A1A1A, justify between)
 *     left  (gap 10): paperclip + smile + sparkles(lime) + signature
 *                     + 1px vertical divider + trash-2 — icons 14 #999
 *     right (gap 8) : SCHEDULE pill (radius 18, bg #000, padding [0,14],
 *                     1px #1A1A1A border, 36 high, gap 6: alarm-clock 12
 *                     #999 + "SCHEDULE" 9/700 #999 tracking 1.5)
 *                   + SEND pill (radius 18, lime, drop-shadow blur 14
 *                     #BFFF0040 y=3, padding [0,18], 36 high, gap 6:
 *                     "SEND" 10/700 black tracking 1.5 + send icon 12
 *                     black)
 */
export function InlineComposer({
  mode,
  to,
  cc,
  bcc,
  subject,
  initialBody = '',
  onCancel,
  onSend,
}: InlineComposerProps) {
  const [body, setBody] = useState(initialBody)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // For Reply All variant the user might want to add Cc/Bcc — Pencil
  // ships a "B-ReplyWithCcBcc" variant for this.  The reveal is
  // user-driven; clicking the link toggles the rows on.
  const [showCc, setShowCc] = useState((cc?.length ?? 0) > 0)
  const [showBcc, setShowBcc] = useState((bcc?.length ?? 0) > 0)
  const [ccChips, setCcChips] = useState<RecipientChip[]>(cc ?? [])
  const [bccChips, setBccChips] = useState<RecipientChip[]>(bcc ?? [])
  const [editableSubject, setEditableSubject] = useState(subject ?? '')

  async function handleSend() {
    if (sending) return
    if (to.length === 0) {
      setError('Add at least one recipient.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await onSend({
        to,
        cc: ccChips.length > 0 ? ccChips : undefined,
        bcc: bccChips.length > 0 ? bccChips : undefined,
        subject: mode === 'forward' ? editableSubject : subject,
        body,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send.')
      setSending(false)
    }
  }

  const eyebrow = computeEyebrow(mode, to.length + ccChips.length)

  return (
    <section
      className="flex flex-col"
      style={{
        background: '#111111',
        borderRadius: 14,
        border: '2px solid var(--color-wm-accent)',
        boxShadow: '0 0 24px 0 rgba(191,255,0,0.10)',
      }}
    >
      {/* eyebrow */}
      <div
        className="flex items-center"
        style={{ gap: 8, padding: '12px 16px 8px 16px' }}
      >
        {eyebrow.icon}
        <span
          className="font-mono font-bold uppercase text-wm-accent"
          style={{ fontSize: 9, letterSpacing: 1.5 }}
        >
          {eyebrow.label}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="cursor-pointer text-wm-text-muted transition-colors hover:text-wm-text-primary"
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* To row — always present */}
      <FieldRow label="To" chips={to} />

      {/* Cc / Bcc rows — Reply All variant lets the user reveal these.
          Reply / Forward keep them hidden unless the caller pre-seeded. */}
      {showCc && <FieldRow label="Cc" chips={ccChips} editable onChange={setCcChips} />}
      {showBcc && <FieldRow label="Bcc" chips={bccChips} editable onChange={setBccChips} />}

      {/* Forward also gets a Subject row. */}
      {mode === 'forward' && (
        <div
          className="flex w-full items-center"
          style={{
            padding: '12px 16px',
            gap: 10,
            borderBottom: '1px solid var(--color-wm-border)',
          }}
        >
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 11, letterSpacing: 1, color: '#6e6e6e' }}
          >
            Subject
          </span>
          <input
            type="text"
            value={editableSubject}
            onChange={(e) => setEditableSubject(e.target.value)}
            className="flex-1 bg-transparent font-mono font-medium text-wm-text-primary outline-none"
            style={{ fontSize: 13 }}
          />
        </div>
      )}

      {/* Reveal links for Reply / Reply All — Pencil shows a small
          right-aligned "Cc Bcc" toggle on the To row when neither is
          showing. */}
      {(mode === 'reply' || mode === 'reply-all') && (!showCc || !showBcc) && (
        <div
          className="flex items-center justify-end"
          style={{ padding: '4px 16px 0 16px', gap: 8 }}
        >
          {!showCc && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              className="cursor-pointer font-mono font-semibold text-wm-text-tertiary hover:text-wm-text-secondary"
              style={{ fontSize: 10, letterSpacing: 1 }}
            >
              + CC
            </button>
          )}
          {!showBcc && (
            <button
              type="button"
              onClick={() => setShowBcc(true)}
              className="cursor-pointer font-mono font-semibold text-wm-text-tertiary hover:text-wm-text-secondary"
              style={{ fontSize: 10, letterSpacing: 1 }}
            >
              + BCC
            </button>
          )}
        </div>
      )}

      {/* body */}
      <div style={{ padding: '16px 18px 18px 18px' }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply…"
          autoFocus
          className="w-full resize-none bg-transparent font-mono text-wm-text-primary outline-none placeholder:text-wm-text-muted"
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            fontWeight: 500,
            minHeight: 96,
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: '0 16px 8px 16px',
          }}
        >
          <p
            className="font-mono text-wm-error"
            style={{ fontSize: 11, fontWeight: 500 }}
          >
            {error}
          </p>
        </div>
      )}

      {/* footer */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--color-wm-border)',
        }}
      >
        {/* left action stack */}
        <div className="flex items-center" style={{ gap: 10 }}>
          <FooterIc label="Attach"><Paperclip style={{ width: 14, height: 14 }} /></FooterIc>
          <FooterIc label="Emoji"><Smile style={{ width: 14, height: 14 }} /></FooterIc>
          <FooterIc label="AI assist" lime>
            <Sparkles style={{ width: 14, height: 14, color: 'var(--color-wm-accent)' }} />
          </FooterIc>
          <FooterIc label="Signature"><Signature style={{ width: 14, height: 14 }} /></FooterIc>
          <span
            aria-hidden
            style={{ width: 1, height: 14, background: 'var(--color-wm-border)' }}
          />
          <FooterIc label="Discard" onClick={onCancel}>
            <Trash2 style={{ width: 14, height: 14, color: '#6e6e6e' }} />
          </FooterIc>
        </div>

        {/* right send stack */}
        <div className="flex items-center" style={{ gap: 8 }}>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center transition-colors hover:bg-wm-surface-hover"
            style={{
              height: 36,
              padding: '0 14px',
              gap: 6,
              borderRadius: 18,
              background: '#000000',
              border: '1px solid var(--color-wm-border)',
            }}
          >
            <AlarmClock style={{ width: 12, height: 12, color: '#999999' }} />
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 9, letterSpacing: 1.5, color: '#999999' }}
            >
              Schedule
            </span>
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className={cn(
              'inline-flex items-center transition-colors',
              sending
                ? 'cursor-wait opacity-60'
                : 'cursor-pointer hover:bg-wm-accent-hover',
            )}
            style={{
              height: 36,
              padding: '0 18px',
              gap: 6,
              borderRadius: 18,
              background: 'var(--color-wm-accent)',
              boxShadow: '0 3px 14px 0 rgba(191,255,0,0.25)',
            }}
          >
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 10, letterSpacing: 1.5, color: '#000000' }}
            >
              {sending ? 'Sending…' : 'Send'}
            </span>
            {!sending && (
              <Send style={{ width: 12, height: 12, color: '#000000' }} />
            )}
          </button>
        </div>
      </div>
    </section>
  )
}

function computeEyebrow(mode: InlineComposerMode, recipientCount: number) {
  switch (mode) {
    case 'reply':
      return {
        icon: <Reply style={{ width: 13, height: 13, color: 'var(--color-wm-accent)' }} />,
        label: 'Reply',
      }
    case 'reply-all':
      return {
        icon: <ReplyAll style={{ width: 13, height: 13, color: 'var(--color-wm-accent)' }} />,
        label: `Reply all · ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`,
      }
    case 'forward':
      return {
        icon: <Forward style={{ width: 13, height: 13, color: 'var(--color-wm-accent)' }} />,
        label: 'Forward',
      }
  }
}

/// One field row inside the composer (To / Cc / Bcc).  Renders the
/// label + the chip stack.  The `editable` flag toggles the input
/// affordance for adding new chips; the immutable variant (Reply's
/// To row) is just a display strip.
function FieldRow({
  label,
  chips,
  editable,
  onChange,
}: {
  label: string
  chips: RecipientChip[]
  editable?: boolean
  onChange?: (next: RecipientChip[]) => void
}) {
  const [draft, setDraft] = useState('')

  function commit(value: string) {
    const trimmed = value.trim()
    if (!trimmed || !trimmed.includes('@')) return
    if (chips.some((c) => c.email === trimmed)) {
      setDraft('')
      return
    }
    onChange?.([...chips, { email: trimmed }])
    setDraft('')
  }

  return (
    <div
      className="flex w-full items-center"
      style={{
        padding: '10px 16px',
        gap: 10,
        borderBottom: '1px solid var(--color-wm-border)',
      }}
    >
      <span
        className="font-mono font-bold uppercase"
        style={{ fontSize: 11, letterSpacing: 1, color: '#6e6e6e' }}
      >
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center" style={{ gap: 6 }}>
        {chips.map((chip) => (
          <span
            key={chip.email}
            className="inline-flex items-center font-mono"
            style={{
              padding: '4px 10px 4px 4px',
              gap: 8,
              borderRadius: 14,
              background: '#000000',
              border: '1px solid var(--color-wm-border)',
              fontSize: 11,
            }}
          >
            <span
              aria-hidden
              className="flex items-center justify-center rounded-full font-mono font-bold text-white"
              style={{
                width: 18,
                height: 18,
                fontSize: 9,
                background: stringHashColor(chip.email),
              }}
            >
              {(chip.name?.[0] ?? chip.email[0] ?? '?').toUpperCase()}
            </span>
            <span className="text-wm-text-primary">
              {chip.name ?? chip.email}
            </span>
            {editable && onChange && (
              <button
                type="button"
                onClick={() =>
                  onChange(chips.filter((c) => c.email !== chip.email))
                }
                aria-label={`Remove ${chip.email}`}
                className="cursor-pointer text-wm-text-muted hover:text-wm-text-primary"
              >
                <X style={{ width: 11, height: 11 }} />
              </button>
            )}
          </span>
        ))}
        {editable && (
          <input
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                commit(draft)
              }
            }}
            onBlur={() => commit(draft)}
            placeholder={chips.length === 0 ? 'name@example.com' : ''}
            className="min-w-[120px] flex-1 bg-transparent font-mono text-wm-text-primary outline-none placeholder:text-wm-text-muted"
            style={{ fontSize: 12, fontWeight: 500 }}
          />
        )}
      </div>
    </div>
  )
}

function FooterIc({
  label,
  lime,
  onClick,
  children,
}: {
  label: string
  lime?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex cursor-pointer items-center justify-center transition-colors',
        lime ? 'text-wm-accent' : 'text-wm-text-secondary hover:text-wm-text-primary',
      )}
      style={{ width: 14, height: 14 }}
    >
      {children}
    </button>
  )
}

/// Tiny deterministic hash → HSL color so chip avatars stay stable
/// per email.  Same shape as `lib/utils.stringToColor` but inlined to
/// avoid a circular import.
function stringHashColor(s: string): string {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  }
  const palette = [
    '#1B6FE0',
    '#A855F7',
    '#F59E0B',
    '#3DB874',
    '#D44A4A',
    '#6D4AD4',
    '#D4A24A',
    '#4A6FD4',
  ]
  return palette[hash % palette.length]
}
