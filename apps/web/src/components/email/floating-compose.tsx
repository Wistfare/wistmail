'use client'

import { useState, useEffect } from 'react'
import {
  Send,
  Trash2,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Bold,
  Italic,
  Underline,
  Link2,
  Paperclip,
  Clock,
  ChevronDown,
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
 * Floating compose popup — Pencil reference: `Screen/FloatingCompose`
 * (`tYDXb`) and `composePopup` (`7fMbA`).
 *
 * Geometry (sharp 0-radius corners, sits flush bottom-right):
 *   container 560×582, fill #111111, outside 1px #1A1A1A,
 *     shadow blur 24 #00000066 offset y=-4
 *   titleBar  bg #1A2200, padding [10,16], gap 8, 1px bottom #1A1A1A
 *     - "New Message" Inter 13/600 white
 *     - flex
 *     - minus 16, maximize-2 14, x 16 — all #404040
 *   fields (vertical, each row 1px bottom #1A1A1A):
 *     fromRow:  padding [8,16] gap 8 — "From" 11/normal #404040 mono +
 *               value 12/normal white mono
 *     toRow:    padding [8,16] gap 8 — "To" 11/normal #404040 +
 *               chip(s) (1px #1A1A1A border, padding [2,8], gap 4,
 *                       text 11 white, x 10 #404040) + flex +
 *               "Cc  Bcc" 10/normal #404040
 *     subjectRow: padding [8,16] — "Subject" 11/normal #404040 +
 *                 Inter 13/500 white
 *   bodyArea: padding [12,16], Inter 13/normal #999999 lineHeight 1.6
 *   toolbar:  padding [8,12], gap 4, 1px top #1A1A1A
 *     bold/italic/underline (16 #404040) | sep | link-2/paperclip
 *     | flex | trash-2 (16 #404040) | sep |
 *     sendBtn — lime fill, padding [6,14], gap 6:
 *       send icon 14 black + "Send" mono 12/600 black
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
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        // Schedule send is still a real send — server flips the draft
        // into folder='drafts' with scheduledAt set and the dispatcher
        // picks it up when the timestamp elapses. Passing send:true
        // here is what tells the server "this is scheduled, not a
        // saved draft that the user will finish later."
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

  // Minimized: just the title bar strip — keeps the same #1A2200 bar
  // shape so it reads as a docked compose, not a tooltip.
  if (mode === 'minimized') {
    return (
      <div
        className="fixed bottom-0 right-6 z-50 flex w-72 items-center"
        style={{
          background: '#111111',
          border: '1px solid #1A1A1A',
          boxShadow: '0 -4px 24px 0 rgba(0,0,0,0.4)',
        }}
      >
        <button
          onClick={() => setMode('open')}
          className="flex w-full cursor-pointer items-center bg-wm-accent-dim text-left transition-colors hover:bg-wm-accent-dim/80"
          style={{
            gap: 8,
            padding: '10px 16px',
          }}
        >
          <span
            className="flex-1 truncate font-sans font-semibold text-wm-text-primary"
            style={{ fontSize: 13 }}
          >
            {subject || 'New Message'}
          </span>
          <Maximize2
            style={{ width: 14, height: 14, color: '#404040' }}
            onClick={(e) => {
              e.stopPropagation()
              setMode('expanded')
            }}
          />
          <X
            style={{ width: 16, height: 16, color: '#404040' }}
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
  // Container styles. Pencil uses the same chrome when expanded — just
  // covers more of the viewport — so we keep the borders/shadows
  // identical and only change the placement.
  const containerStyle: React.CSSProperties = isExpanded
    ? {
        position: 'fixed',
        inset: 16,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        background: '#111111',
        border: '1px solid #1A1A1A',
        boxShadow: '0 -4px 24px 0 rgba(0,0,0,0.4)',
      }
    : {
        position: 'fixed',
        bottom: 0,
        right: 24,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        width: 560,
        height: 582,
        background: '#111111',
        border: '1px solid #1A1A1A',
        boxShadow: '0 -4px 24px 0 rgba(0,0,0,0.4)',
      }

  return (
    <>
      {/* Dim overlay for expanded mode — Pencil `dimOverlay` (#00000033). */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setMode('open')}
        />
      )}

      <div style={containerStyle}>
        {/* titleBar — bg #1A2200, padding [10,16], gap 8, 1px bottom. */}
        <div
          className="flex items-center bg-wm-accent-dim"
          style={{
            gap: 8,
            padding: '10px 16px',
            borderBottom: '1px solid #1A1A1A',
          }}
        >
          <span
            className="font-sans font-semibold text-wm-text-primary"
            style={{ fontSize: 13 }}
          >
            {inReplyTo ? 'Re: ' + (subject || 'New Message') : 'New Message'}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setMode('minimized')}
            aria-label="Minimize"
            className="flex cursor-pointer items-center justify-center transition-colors hover:text-wm-text-primary"
            style={{ width: 16, height: 16, color: '#404040' }}
          >
            <Minus style={{ width: 16, height: 16 }} />
          </button>
          <button
            type="button"
            onClick={() => setMode(isExpanded ? 'open' : 'expanded')}
            aria-label={isExpanded ? 'Restore' : 'Expand'}
            className="flex cursor-pointer items-center justify-center transition-colors hover:text-wm-text-primary"
            style={{ width: 14, height: 14, color: '#404040' }}
          >
            {isExpanded ? (
              <Minimize2 style={{ width: 14, height: 14 }} />
            ) : (
              <Maximize2 style={{ width: 14, height: 14 }} />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close compose"
            className="flex cursor-pointer items-center justify-center transition-colors hover:text-wm-error"
            style={{ width: 16, height: 16, color: '#404040' }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* fields */}
        {/* From row — Pencil `HtD9n`. */}
        <div
          className="flex items-center"
          style={{
            gap: 8,
            padding: '8px 16px',
            borderBottom: '1px solid #1A1A1A',
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 11, color: '#404040', minWidth: 56 }}
          >
            From
          </span>
          {mailboxes.length > 1 ? (
            <select
              value={fromMailboxId}
              onChange={(e) => {
                setFromMailboxId(e.target.value)
                const mb = mailboxes.find((m) => m.id === e.target.value)
                if (mb) setFromAddress(mb.address)
              }}
              className="flex-1 bg-transparent font-mono text-wm-text-primary outline-none"
              style={{ fontSize: 12 }}
            >
              {mailboxes.map((mb) => (
                <option key={mb.id} value={mb.id}>
                  {mb.address}
                </option>
              ))}
            </select>
          ) : (
            <span
              className="flex-1 truncate font-mono text-wm-text-primary"
              style={{ fontSize: 12 }}
            >
              {fromAddress}
            </span>
          )}
        </div>

        {/* To row — Pencil `9TINl`. We use RecipientChipsField for
            the input itself and overlay Cc/Bcc reveal on the right. */}
        <div className="relative" style={{ borderBottom: '1px solid #1A1A1A' }}>
          <RecipientChipsField
            label="To"
            values={toChips}
            onChange={setToChips}
            placeholder="recipient@example.com"
          />
          {(!showCc || !showBcc) && (
            <div className="pointer-events-none absolute right-4 top-2 flex items-center gap-2">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="pointer-events-auto cursor-pointer font-mono hover:text-wm-text-secondary"
                  style={{ fontSize: 10, color: '#404040' }}
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="pointer-events-auto cursor-pointer font-mono hover:text-wm-text-secondary"
                  style={{ fontSize: 10, color: '#404040' }}
                >
                  Bcc
                </button>
              )}
            </div>
          )}
        </div>

        {showCc && (
          <RecipientChipsField
            label="Cc"
            values={ccChips}
            onChange={setCcChips}
            placeholder="Add Cc..."
            className="border-b"
            // Border colour set via the wrapper class above — the
            // component itself accepts arbitrary className and merges
            // it with its own padding/gap.
          />
        )}

        {showBcc && (
          <RecipientChipsField
            label="Bcc"
            values={bccChips}
            onChange={setBccChips}
            placeholder="Add Bcc..."
            className="border-b"
          />
        )}

        {/* Subject row — Pencil `GX2Po`. */}
        <div
          className="flex items-center"
          style={{
            gap: 8,
            padding: '8px 16px',
            borderBottom: '1px solid #1A1A1A',
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 11, color: '#404040', minWidth: 56 }}
          >
            Subject
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="flex-1 bg-transparent font-sans font-medium text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            style={{ fontSize: 13 }}
          />
        </div>

        {/* Body — Pencil `bppiU`, padding [12,16], Inter 13/normal #999999 lh 1.6. */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '12px 16px' }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email..."
            className="h-full w-full resize-none bg-transparent font-sans placeholder:text-wm-text-muted outline-none"
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: '#999999',
            }}
            autoFocus
          />
        </div>

        {/* Inline error strip — out of Pencil's spec but unobtrusive. */}
        {error && (
          <div
            style={{
              padding: '6px 16px',
              borderTop: '1px solid #1A1A1A',
            }}
          >
            <p className="font-mono text-wm-error" style={{ fontSize: 10 }}>
              {error}
            </p>
          </div>
        )}

        {/* toolbar — Pencil `PMTuu`, padding [8,12], gap 4, 1px top. */}
        <div
          className="flex items-center"
          style={{
            gap: 4,
            padding: '8px 12px',
            borderTop: '1px solid #1A1A1A',
          }}
        >
          {[
            { Icon: Bold, label: 'Bold' },
            { Icon: Italic, label: 'Italic' },
            { Icon: Underline, label: 'Underline' },
          ].map(({ Icon, label }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              className="flex cursor-pointer items-center justify-center transition-colors hover:text-wm-text-primary"
              style={{ width: 24, height: 24, color: '#404040' }}
            >
              <Icon style={{ width: 16, height: 16 }} />
            </button>
          ))}
          <span
            aria-hidden
            style={{
              width: 1,
              height: 16,
              background: '#1A1A1A',
              margin: '0 4px',
            }}
          />
          {[
            { Icon: Link2, label: 'Add link' },
            { Icon: Paperclip, label: 'Attach file' },
          ].map(({ Icon, label }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              className="flex cursor-pointer items-center justify-center transition-colors hover:text-wm-text-primary"
              style={{ width: 24, height: 24, color: '#404040' }}
            >
              <Icon style={{ width: 16, height: 16 }} />
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Discard draft"
            className="flex cursor-pointer items-center justify-center transition-colors hover:text-wm-error"
            style={{ width: 24, height: 24, color: '#404040' }}
          >
            <Trash2 style={{ width: 16, height: 16 }} />
          </button>
          <span
            aria-hidden
            style={{
              width: 1,
              height: 16,
              background: '#1A1A1A',
              margin: '0 4px',
            }}
          />

          {/* Schedule popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSchedule(!showSchedule)}
              aria-label="Schedule send"
              className="flex cursor-pointer items-center transition-colors hover:text-wm-text-primary"
              style={{ gap: 2, height: 24, padding: '0 4px', color: '#404040' }}
            >
              <Clock style={{ width: 14, height: 14 }} />
              <ChevronDown style={{ width: 12, height: 12 }} />
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
                    bottom: 36,
                    right: 0,
                    width: 240,
                    background: '#111111',
                    border: '1px solid #1A1A1A',
                    boxShadow: '0 8px 24px 0 rgba(0,0,0,0.4)',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid #1A1A1A',
                    }}
                  >
                    <span
                      className="font-mono font-bold uppercase"
                      style={{
                        fontSize: 10,
                        letterSpacing: 1.5,
                        color: 'var(--color-wm-text-tertiary)',
                      }}
                    >
                      Schedule send
                    </span>
                  </div>
                  {[
                    { label: 'Tomorrow morning', time: getScheduleTime(1, 9) },
                    {
                      label: 'Tomorrow afternoon',
                      time: getScheduleTime(1, 13),
                    },
                    { label: 'Monday morning', time: getScheduleTime('monday', 9) },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        setScheduledAt(opt.time)
                        setShowSchedule(false)
                      }}
                      className="flex w-full cursor-pointer items-center text-left text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
                      style={{
                        gap: 8,
                        padding: '8px 12px',
                        fontSize: 12,
                      }}
                    >
                      <Clock
                        style={{
                          width: 12,
                          height: 12,
                          color: 'var(--color-wm-text-muted)',
                        }}
                      />
                      {opt.label}
                      <span style={{ flex: 1 }} />
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 10,
                          color: 'var(--color-wm-text-muted)',
                        }}
                      >
                        {formatSchedulePreview(opt.time)}
                      </span>
                    </button>
                  ))}
                  <div
                    style={{
                      padding: '8px 12px',
                      borderTop: '1px solid #1A1A1A',
                    }}
                  >
                    <label
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        color: 'var(--color-wm-text-muted)',
                      }}
                    >
                      Pick date &amp; time
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="mt-1 w-full bg-wm-bg font-mono text-wm-text-primary outline-none"
                      style={{
                        padding: '6px 8px',
                        border: '1px solid #1A1A1A',
                        fontSize: 12,
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* sendBtn — Pencil `az3d4`. Sharp 0-radius lime pill. */}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className={cn(
              'flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover',
              sending && 'opacity-50',
            )}
            style={{
              gap: 6,
              padding: '6px 14px',
              color: '#000000',
            }}
          >
            <Send style={{ width: 14, height: 14 }} />
            <span
              className="font-mono font-semibold"
              style={{ fontSize: 12 }}
            >
              {sending ? 'Sending…' : scheduledAt ? 'Schedule' : 'Send'}
            </span>
          </button>
        </div>
      </div>
    </>
  )
}
