'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  AlarmClock,
  Calendar as CalendarIcon,
  ChevronDown,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Send,
  Smile,
  Sparkles,
  SquarePen,
  X,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { getMailboxes, type Mailbox } from '@/lib/mailboxes-cache'
import { RecipientChipsField } from './recipient-chips-field'

function getScheduleTime(dayOffset: number | 'monday', hour: number): string {
  const d = new Date()
  if (dayOffset === 'monday') {
    const day = d.getDay()
    const daysUntilMonday = day === 0 ? 1 : 8 - day
    d.setDate(d.getDate() + daysUntilMonday)
  } else {
    d.setDate(d.getDate() + dayOffset)
  }
  d.setHours(hour, 0, 0, 0)
  return d.toISOString().slice(0, 16)
}

function formatSchedulePreview(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export type ComposeData = {
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  inReplyTo?: string
  body?: string
}

interface FloatingComposeProps {
  initialData?: ComposeData
  onClose: () => void
  onSent?: () => void
}

/**
 * Floating compose popup — Pencil reference: `Screen/ComposeV3-Signature`
 * (`Qe0q2.composeModal` / `Xl7Os`).
 *
 * Used only for the "+ NEW" → "New email" creation flow now. Reply /
 * reply-all / forward live inline in the thread reading pane via
 * `<InlineComposer>` (see `inline-composer.tsx`).
 *
 *   container (`Xl7Os`) — bottom-right, 580×580
 *     cornerRadius [14, 14, 0, 0]   (rounded top corners only)
 *     fill #111111, 1px outside #1A1A1A
 *     drop-shadow blur 48 #000000B0 offset y=-8
 *
 *   mHead (`UnaiP`, padding [16, 20, 14, 20], 1px bottom)
 *     left  (gap 10): square-pen 14 LIME + "NEW EMAIL" 11/700 white
 *                     tracking 1.5
 *     right (gap 6) : 3 round-square 28×28 (radius 8) buttons —
 *                     minus 13 / maximize-2 12 / x 13 — icons #999
 *
 *   fields (`VvzPo`, padding [0, 20, 8, 20])
 *     frTo  (padding [12, 0], 1px bottom):
 *       label "TO" 10/700 #6e6e6e tracking 1.5 width 48
 *       chip stack + cursor "|" lime
 *       "Cc Bcc" toggle 11/600 #6e6e6e
 *     frSubj (padding [12, 0], 1px bottom):
 *       label "SUBJECT" 10/700 #6e6e6e tracking 1.5 width 54
 *       value 13/600 white
 *     frFrom (padding [12, 0]):
 *       label "FROM" 10/700 #6e6e6e tracking 1.5 width 48
 *       chip — radius 14, bg #000, 1px #1A1A1A border, padding
 *         [4, 10, 4, 4]: 20-px lime avatar + 12-px white email +
 *         chevron-down 11 #6e6e6e
 *
 *   aiHint (`qxyXq`, bg #1A2200, padding [10, 20], 1px top + bottom)
 *     sparkles 13 lime + "AI · DRAFT FROM PROMPT" 10/700 lime
 *     tracking 1.5 + flex + "⌘K" 10/600 lime
 *
 *   body (`mky4G`, padding [20, 20, 12, 20], gap 12)
 *     paragraphs Inter 14/normal lineHeight 1.6 (first paragraph
 *     white "Hey Alex,", rest #999)
 *     sigBlk (`R3IcE`, cornerRadius 8, gap 14, padding [10, 0],
 *       1px LEFT border):
 *       sigAv 48×48 cornerRadius 10 lime fill, "W" 22/700 black
 *       sigCol gap 2:
 *         "Veda Nsengimana" Inter 14/700 white
 *         "Founder · Wistmail" Inter 12/500 #999
 *         "veda@wistmail.com · wistmail.com" Inter 11/500 LIME
 *
 *   mTool (`RCjSS`, padding [12, 20, 16, 20], 1px top, justify between)
 *     toolL (gap 4): 4 round-square 32×32 (radius 8) transparent
 *                    buttons — paperclip / image / smile / calendar
 *                    — icons 14 #999
 *     toolR (gap 8):
 *       SCHEDULE pill — radius 18, bg #000, padding [8, 14], 1px
 *         #1A1A1A: alarm-clock 12 #999 + "SCHEDULE" 11/700 #999
 *       SEND pill — radius 18, lime, drop-shadow blur 16
 *         #BFFF0040 offset y=4, padding [8, 16]: send 13 black +
 *         "SEND" 11/700 black tracking 1
 */
export function FloatingCompose({
  initialData,
  onClose,
  onSent,
}: FloatingComposeProps) {
  const [mode, setMode] = useState<'open' | 'minimized' | 'expanded'>('open')
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [fromMailboxId, setFromMailboxId] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [toChips, setToChips] = useState<string[]>(initialData?.to || [])
  const [ccChips, setCcChips] = useState<string[]>(initialData?.cc || [])
  const [bccChips, setBccChips] = useState<string[]>(initialData?.bcc || [])
  const [showCc, setShowCc] = useState((initialData?.cc?.length ?? 0) > 0)
  const [showBcc, setShowBcc] = useState((initialData?.bcc?.length ?? 0) > 0)
  const [subject, setSubject] = useState(initialData?.subject || '')
  const [body, setBody] = useState(initialData?.body || '')
  const [inReplyTo] = useState(initialData?.inReplyTo || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [showFromMenu, setShowFromMenu] = useState(false)

  useEffect(() => {
    let cancelled = false
    getMailboxes()
      .then((list) => {
        if (cancelled || list.length === 0) return
        setMailboxes(list)
        setFromMailboxId(list[0].id)
        setFromAddress(list[0].address)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSend() {
    if (toChips.length === 0) {
      setError('At least one recipient is required')
      return
    }
    if (!subject.trim()) {
      setError('Subject is required')
      return
    }
    setSending(true)
    setError('')
    try {
      await api.post('/api/v1/inbox/compose', {
        fromAddress,
        toAddresses: toChips,
        cc: ccChips.length > 0 ? ccChips : undefined,
        bcc: bccChips.length > 0 ? bccChips : undefined,
        subject,
        textBody: body,
        mailboxId: fromMailboxId,
        inReplyTo: inReplyTo || undefined,
        scheduledAt: scheduledAt
          ? new Date(scheduledAt).toISOString()
          : undefined,
        send: true,
      })
      onSent?.()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  // Minimized: just the header strip pinned to bottom-right.
  if (mode === 'minimized') {
    return (
      <div
        className="fixed bottom-0 right-6 z-50 flex w-72 items-center"
        style={{
          background: '#111111',
          border: '1px solid var(--color-wm-border)',
          borderRadius: '14px 14px 0 0',
          boxShadow: '0 -8px 48px 0 rgba(0,0,0,0.7)',
        }}
      >
        <button
          onClick={() => setMode('open')}
          className="flex w-full cursor-pointer items-center text-left"
          style={{
            gap: 10,
            padding: '14px 20px',
          }}
        >
          <SquarePen
            style={{ width: 14, height: 14, color: 'var(--color-wm-accent)' }}
          />
          <span
            className="flex-1 truncate font-mono font-bold uppercase text-wm-text-primary"
            style={{ fontSize: 11, letterSpacing: 1.5 }}
          >
            {subject || 'New email'}
          </span>
          <Maximize2
            style={{ width: 12, height: 12, color: '#999999' }}
            onClick={(e) => {
              e.stopPropagation()
              setMode('open')
            }}
          />
          <X
            style={{ width: 13, height: 13, color: '#999999' }}
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
          />
        </button>
      </div>
    )
  }

  const isExpanded = mode === 'expanded'
  const containerStyle: React.CSSProperties = isExpanded
    ? {
        position: 'fixed',
        inset: 16,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        background: '#111111',
        border: '1px solid var(--color-wm-border)',
        borderRadius: 14,
        boxShadow: '0 -8px 48px 0 rgba(0,0,0,0.7)',
      }
    : {
        position: 'fixed',
        bottom: 0,
        right: 24,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        width: 580,
        height: 580,
        background: '#111111',
        border: '1px solid var(--color-wm-border)',
        // Pencil cornerRadius [14, 14, 0, 0] — top-rounded, flat bottom
        // since the popup sits flush against the viewport edge.
        borderRadius: '14px 14px 0 0',
        boxShadow: '0 -8px 48px 0 rgba(0,0,0,0.7)',
      }

  const fromInitial = useMemo(() => {
    return (fromAddress.split('@')[0]?.[0] ?? 'W').toUpperCase()
  }, [fromAddress])

  return (
    <>
      {isExpanded && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setMode('open')}
        />
      )}

      <div style={containerStyle}>
        {/* mHead — header */}
        <div
          className="flex w-full items-center justify-between"
          style={{
            padding: '16px 20px 14px 20px',
          }}
        >
          <div className="flex items-center" style={{ gap: 10 }}>
            <SquarePen
              style={{ width: 14, height: 14, color: 'var(--color-wm-accent)' }}
            />
            <span
              className="font-mono font-bold uppercase text-wm-text-primary"
              style={{ fontSize: 11, letterSpacing: 1.5 }}
            >
              New email
            </span>
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            <HeaderIc label="Minimize" onClick={() => setMode('minimized')}>
              <Minus style={{ width: 13, height: 13 }} />
            </HeaderIc>
            <HeaderIc
              label={isExpanded ? 'Restore' : 'Expand'}
              onClick={() => setMode(isExpanded ? 'open' : 'expanded')}
            >
              {isExpanded ? (
                <Minimize2 style={{ width: 12, height: 12 }} />
              ) : (
                <Maximize2 style={{ width: 12, height: 12 }} />
              )}
            </HeaderIc>
            <HeaderIc label="Close" onClick={onClose}>
              <X style={{ width: 13, height: 13 }} />
            </HeaderIc>
          </div>
        </div>

        {/* fields */}
        <div className="flex flex-col" style={{ padding: '0 20px 8px 20px' }}>
          {/* TO row */}
          <div
            className="flex items-center"
            style={{
              padding: '8px 0',
              gap: 14,
            }}
          >
            <span
              className="font-mono font-bold uppercase shrink-0"
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: '#6e6e6e',
                width: 48,
              }}
            >
              To
            </span>
            <div className="flex-1 min-w-0">
              <RecipientChipsField
                label=""
                values={toChips}
                onChange={setToChips}
                placeholder="recipient@example.com"
                className="!p-0"
                excludedEmails={[...ccChips, ...bccChips]}
              />
            </div>
            {(!showCc || !showBcc) && (
              <div className="flex items-center" style={{ gap: 4 }}>
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="cursor-pointer font-mono font-semibold hover:text-wm-text-secondary"
                    style={{ fontSize: 11, color: '#6e6e6e' }}
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="cursor-pointer font-mono font-semibold hover:text-wm-text-secondary"
                    style={{ fontSize: 11, color: '#6e6e6e' }}
                  >
                    Bcc
                  </button>
                )}
              </div>
            )}
          </div>

          {showCc && (
            <CollapsibleRecipientRow
              label="Cc"
              values={ccChips}
              onChange={setCcChips}
              placeholder="cc@example.com"
              onCollapse={() => setShowCc(false)}
              excludedEmails={[...toChips, ...bccChips]}
            />
          )}

          {showBcc && (
            <CollapsibleRecipientRow
              label="Bcc"
              values={bccChips}
              onChange={setBccChips}
              placeholder="bcc@example.com"
              onCollapse={() => setShowBcc(false)}
              excludedEmails={[...toChips, ...ccChips]}
            />
          )}

          {/* FROM row — Pencil V3 places this directly under TO/Cc/
              Bcc so the user confirms which mailbox they're replying
              from before composing.  Subject sits below FROM. */}
          <div
            className="flex items-center"
            style={{ padding: '8px 0', gap: 14 }}
          >
            <span
              className="font-mono font-bold uppercase shrink-0"
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: '#6e6e6e',
                width: 48,
              }}
            >
              From
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFromMenu((v) => !v)}
                className="inline-flex cursor-pointer items-center"
                style={{
                  padding: '4px 10px 4px 4px',
                  gap: 8,
                  borderRadius: 14,
                  background: '#000000',
                  border: '1px solid var(--color-wm-border)',
                }}
              >
                <span
                  aria-hidden
                  className="flex items-center justify-center font-mono font-bold"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: 'var(--color-wm-accent)',
                    color: '#000000',
                    fontSize: 10,
                  }}
                >
                  {fromInitial}
                </span>
                <span
                  className="font-mono text-wm-text-primary"
                  style={{ fontSize: 12 }}
                >
                  {fromAddress || 'pick a mailbox'}
                </span>
                <ChevronDown
                  style={{ width: 11, height: 11, color: '#6e6e6e' }}
                />
              </button>
              {showFromMenu && mailboxes.length > 1 && (
                <>
                  <div
                    className="fixed inset-0 z-50"
                    onClick={() => setShowFromMenu(false)}
                  />
                  <div
                    className="absolute z-50"
                    style={{
                      top: 'calc(100% + 6px)',
                      left: 0,
                      minWidth: 240,
                      background: '#111111',
                      border: '1px solid var(--color-wm-border)',
                      borderRadius: 10,
                      boxShadow: '0 12px 32px 0 rgba(0,0,0,0.5)',
                    }}
                  >
                    {mailboxes.map((mb) => (
                      <button
                        key={mb.id}
                        type="button"
                        onClick={() => {
                          setFromMailboxId(mb.id)
                          setFromAddress(mb.address)
                          setShowFromMenu(false)
                        }}
                        className="block w-full cursor-pointer px-3 py-2 text-left font-mono text-wm-text-primary hover:bg-wm-surface-hover"
                        style={{ fontSize: 12 }}
                      >
                        {mb.address}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* SUBJECT row */}
          <div
            className="flex items-center"
            style={{
              padding: '8px 0',
              gap: 14,
            }}
          >
            <span
              className="font-mono font-bold uppercase shrink-0"
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: '#6e6e6e',
                width: 54,
              }}
            >
              Subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className="flex-1 bg-transparent font-mono font-semibold text-wm-text-primary outline-none placeholder:text-wm-text-muted"
              style={{ fontSize: 13 }}
            />
          </div>
        </div>

        {/* aiHint — Pencil `qxyXq` declares stroke top + bottom with
            no fill, so the borders aren't visible.  The lime-tinted
            `bg #1A2200` is the only thing separating this row from
            the fields above and the body below. */}
        <div
          className="flex w-full items-center"
          style={{
            padding: '10px 20px',
            gap: 10,
            background: 'var(--color-wm-accent-dim)',
          }}
        >
          <Sparkles
            style={{ width: 13, height: 13, color: 'var(--color-wm-accent)' }}
          />
          <span
            className="font-mono font-bold uppercase text-wm-accent"
            style={{ fontSize: 10, letterSpacing: 1.5 }}
          >
            AI · Draft from prompt
          </span>
          <span style={{ flex: 1 }} />
          <span
            className="font-mono font-semibold text-wm-accent"
            style={{ fontSize: 10 }}
          >
            ⌘K
          </span>
        </div>

        {/* body */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: '20px 20px 12px 20px' }}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email…"
            className="w-full resize-none bg-transparent font-sans outline-none placeholder:text-wm-text-muted"
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: '#FFFFFF',
              minHeight: 120,
            }}
            autoFocus
          />
        </div>

        {/* inline error */}
        {error && (
          <div style={{ padding: '0 20px 8px 20px' }}>
            <p
              className="font-mono text-wm-error"
              style={{ fontSize: 11, fontWeight: 500 }}
            >
              {error}
            </p>
          </div>
        )}

        {/* mTool — bottom toolbar.  Pencil `RCjSS` declares a stroke
            top with the fill explicitly disabled, so no visible
            separator: the toolbar floats over the body's white-space. */}
        <div
          className="flex w-full items-center justify-between"
          style={{
            padding: '12px 20px 16px 20px',
          }}
        >
          <div className="flex items-center" style={{ gap: 4 }}>
            <ToolIc label="Attach"><Paperclip style={{ width: 14, height: 14 }} /></ToolIc>
            <ToolIc label="Image"><ImageIcon style={{ width: 14, height: 14 }} /></ToolIc>
            <ToolIc label="Emoji"><Smile style={{ width: 14, height: 14 }} /></ToolIc>
            <ToolIc label="Calendar"><CalendarIcon style={{ width: 14, height: 14 }} /></ToolIc>
          </div>

          <div className="flex items-center" style={{ gap: 8 }}>
            {/* Schedule pill — opens the schedule menu, otherwise inert. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSchedule((v) => !v)}
                className="inline-flex cursor-pointer items-center transition-colors hover:bg-wm-surface-hover"
                style={{
                  padding: '8px 14px',
                  gap: 6,
                  borderRadius: 18,
                  background: '#000000',
                  border: '1px solid var(--color-wm-border)',
                }}
              >
                <AlarmClock style={{ width: 12, height: 12, color: '#999999' }} />
                <span
                  className="font-mono font-bold uppercase"
                  style={{ fontSize: 11, letterSpacing: 1, color: '#999999' }}
                >
                  Schedule
                </span>
              </button>
              {showSchedule && (
                <>
                  <div
                    className="fixed inset-0 z-50"
                    onClick={() => setShowSchedule(false)}
                  />
                  <div
                    className="absolute z-50"
                    style={{
                      bottom: 'calc(100% + 6px)',
                      right: 0,
                      width: 240,
                      background: '#111111',
                      border: '1px solid var(--color-wm-border)',
                      borderRadius: 10,
                      boxShadow: '0 -12px 32px 0 rgba(0,0,0,0.5)',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--color-wm-border)',
                      }}
                    >
                      <span
                        className="font-mono font-bold uppercase"
                        style={{
                          fontSize: 10,
                          letterSpacing: 1.5,
                          color: '#6e6e6e',
                        }}
                      >
                        Schedule send
                      </span>
                    </div>
                    {[
                      { label: 'Tomorrow morning', time: getScheduleTime(1, 9) },
                      { label: 'Tomorrow afternoon', time: getScheduleTime(1, 13) },
                      { label: 'Monday morning', time: getScheduleTime('monday', 9) },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          setScheduledAt(opt.time)
                          setShowSchedule(false)
                        }}
                        className="flex w-full cursor-pointer items-center text-left text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary"
                        style={{
                          gap: 8,
                          padding: '8px 12px',
                          fontSize: 12,
                        }}
                      >
                        <AlarmClock style={{ width: 12, height: 12, color: '#999999' }} />
                        {opt.label}
                        <span style={{ flex: 1 }} />
                        <span
                          className="font-mono"
                          style={{ fontSize: 10, color: '#999999' }}
                        >
                          {formatSchedulePreview(opt.time)}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

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
                padding: '8px 16px',
                gap: 7,
                borderRadius: 18,
                background: 'var(--color-wm-accent)',
                boxShadow: '0 4px 16px 0 rgba(191,255,0,0.25)',
              }}
            >
              <Send style={{ width: 13, height: 13, color: '#000000' }} />
              <span
                className="font-mono font-bold uppercase"
                style={{ fontSize: 11, letterSpacing: 1, color: '#000000' }}
              >
                {sending ? 'Sending…' : scheduledAt ? 'Schedule' : 'Send'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/// One round-square 28×28 button used in the popup header (mHead.mHR).
function HeaderIc({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex cursor-pointer items-center justify-center text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
      style={{ width: 28, height: 28, borderRadius: 8 }}
    >
      {children}
    </button>
  )
}

/// One transparent 32×32 round-square button used in the bottom toolbar
/// (mTool.toolL).  No background, just an icon on hover-tinted bg.
function ToolIc({
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
      className="flex cursor-pointer items-center justify-center text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
      style={{ width: 32, height: 32, borderRadius: 8 }}
    >
      {children}
    </button>
  )
}

/// Cc / Bcc recipient row that auto-collapses when empty and the user
/// clicks outside it. Mirrors the design intent the user called out:
/// once Cc/Bcc is revealed, the user can dismiss it by clicking
/// elsewhere as long as no chips were added. Once the user adds a
/// chip the row stays open.
function CollapsibleRecipientRow({
  label,
  values,
  onChange,
  placeholder,
  onCollapse,
  excludedEmails,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder: string
  onCollapse: () => void
  excludedEmails?: string[]
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // focusout (bubbles, unlike blur) lets us listen on the wrapper
  // itself: if focus is moving to an element inside the wrapper, do
  // nothing; otherwise, collapse iff the user hasn't added any chips.
  useEffect(() => {
    const node = wrapperRef.current
    if (!node) return
    function onFocusOut(e: FocusEvent) {
      const next = e.relatedTarget as Node | null
      if (next && node && node.contains(next)) return
      if (values.length === 0) onCollapse()
    }
    node.addEventListener('focusout', onFocusOut)
    return () => node.removeEventListener('focusout', onFocusOut)
  }, [values.length, onCollapse])

  return (
    <div
      ref={wrapperRef}
      className="flex items-center"
      style={{ padding: '8px 0', gap: 14 }}
    >
      <span
        className="font-mono font-bold uppercase shrink-0"
        style={{
          fontSize: 10,
          letterSpacing: 1.5,
          color: '#6e6e6e',
          width: 48,
        }}
      >
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <RecipientChipsField
          label=""
          values={values}
          onChange={onChange}
          placeholder={placeholder}
          className="!p-0"
          excludedEmails={excludedEmails}
        />
      </div>
    </div>
  )
}
