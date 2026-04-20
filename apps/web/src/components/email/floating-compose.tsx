'use client'

import { useState, useEffect } from 'react'
import {
  Send, Trash2, X, Minus, Maximize2, Minimize2,
  Bold, Italic, Underline, Link2, Paperclip, Clock, ChevronDown,
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
  return d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
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

export function FloatingCompose({ initialData, onClose, onSent }: FloatingComposeProps) {
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
    if (toChips.length === 0) { setError('At least one recipient is required'); return }
    if (!subject.trim()) { setError('Subject is required'); return }

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
        send: !scheduledAt,
      })
      onSent?.()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  // Minimized: just the title bar strip
  if (mode === 'minimized') {
    return (
      <div className="fixed bottom-0 right-6 z-50 w-72 border border-wm-border bg-wm-surface shadow-lg">
        <button
          onClick={() => setMode('open')}
          className="flex w-full cursor-pointer items-center gap-2 bg-wm-accent-dim px-4 py-2.5"
        >
          <span className="flex-1 truncate text-left text-xs font-semibold text-wm-text-primary">
            {subject || 'New Message'}
          </span>
          <Maximize2 className="h-3.5 w-3.5 text-wm-text-muted" onClick={(e) => { e.stopPropagation(); setMode('expanded') }} />
          <X className="h-3.5 w-3.5 text-wm-text-muted" onClick={(e) => { e.stopPropagation(); onClose() }} />
        </button>
      </div>
    )
  }

  const isExpanded = mode === 'expanded'
  const containerClass = isExpanded
    ? 'fixed inset-4 z-50 flex flex-col border border-wm-border bg-wm-surface shadow-2xl'
    : 'fixed bottom-0 right-6 z-50 flex w-[480px] flex-col border border-wm-border bg-wm-surface shadow-2xl'
  const bodyHeight = isExpanded ? 'flex-1' : 'h-[280px]'

  return (
    <>
      {/* Dim overlay for expanded mode */}
      {isExpanded && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setMode('open')} />}

      <div className={containerClass}>
        {/* Title bar */}
        <div className="flex items-center gap-2 bg-wm-accent-dim px-4 py-2.5 border-b border-wm-border">
          <span className="flex-1 text-xs font-semibold text-wm-text-primary">
            {inReplyTo ? 'Reply' : 'New Message'}
          </span>
          <button onClick={() => setMode('minimized')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
            <Minus className="h-4 w-4" />
          </button>
          <button onClick={() => setMode(isExpanded ? 'open' : 'expanded')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={onClose} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* From */}
        <div className="flex items-center gap-2 border-b border-wm-border px-4 py-2">
          <span className="w-14 font-mono text-[11px] text-wm-text-muted">From</span>
          <select
            value={fromMailboxId}
            onChange={(e) => {
              setFromMailboxId(e.target.value)
              const mb = mailboxes.find((m) => m.id === e.target.value)
              if (mb) setFromAddress(mb.address)
            }}
            className="flex-1 bg-transparent font-mono text-xs text-wm-text-primary outline-none"
          >
            {mailboxes.map((mb) => (
              <option key={mb.id} value={mb.id}>{mb.address}</option>
            ))}
          </select>
        </div>

        {/* To — uses RecipientChipsField with /contacts/search
            autocomplete. Cc/Bcc are revealed via inline buttons that
            sit in the To row's right side until the user opts in. */}
        <div className="relative">
          <RecipientChipsField
            label="To"
            values={toChips}
            onChange={setToChips}
            placeholder="recipient@example.com"
            className="border-b border-wm-border"
          />
          {(!showCc || !showBcc) && (
            <div className="pointer-events-none absolute right-4 top-2 flex items-center gap-2">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="pointer-events-auto cursor-pointer font-mono text-[10px] text-wm-text-muted hover:text-wm-text-secondary"
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="pointer-events-auto cursor-pointer font-mono text-[10px] text-wm-text-muted hover:text-wm-text-secondary"
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
            className="border-b border-wm-border"
          />
        )}

        {showBcc && (
          <RecipientChipsField
            label="Bcc"
            values={bccChips}
            onChange={setBccChips}
            placeholder="Add Bcc..."
            className="border-b border-wm-border"
          />
        )}

        {/* Subject */}
        <div className="flex items-center gap-2 border-b border-wm-border px-4 py-2">
          <span className="w-14 font-mono text-[11px] text-wm-text-muted">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="flex-1 bg-transparent text-[13px] font-medium text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
        </div>

        {/* Body */}
        <div className={cn('overflow-y-auto px-4 py-3', bodyHeight)}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your email..."
            className="h-full w-full resize-none bg-transparent text-[13px] leading-relaxed text-wm-text-secondary placeholder:text-wm-text-muted outline-none"
            autoFocus
          />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-1.5 border-t border-wm-border">
            <p className="font-mono text-[10px] text-wm-error">{error}</p>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1 border-t border-wm-border px-3 py-2">
          {[Bold, Italic, Underline].map((Icon, i) => (
            <button key={i} className="cursor-pointer p-1.5 text-wm-text-muted hover:text-wm-text-secondary">
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <div className="h-4 w-px bg-wm-border" />
          {[Link2, Paperclip].map((Icon, i) => (
            <button key={i} className="cursor-pointer p-1.5 text-wm-text-muted hover:text-wm-text-secondary">
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={onClose} className="cursor-pointer p-1.5 text-wm-text-muted hover:text-wm-error">
            <Trash2 className="h-4 w-4" />
          </button>
          <div className="h-4 w-px bg-wm-border" />

          {/* Schedule */}
          <div className="relative">
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              className="flex cursor-pointer items-center gap-1 p-1.5 text-wm-text-muted hover:text-wm-text-secondary"
            >
              <Clock className="h-4 w-4" />
              <ChevronDown className="h-3 w-3" />
            </button>
            {showSchedule && (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setShowSchedule(false)} />
                <div className="absolute bottom-8 right-0 z-50 w-56 border border-wm-border bg-wm-surface shadow-lg">
                  <div className="px-3 py-2 border-b border-wm-border">
                    <span className="font-mono text-[10px] font-semibold text-wm-text-muted">SCHEDULE SEND</span>
                  </div>
                  {[
                    { label: 'Tomorrow morning', time: getScheduleTime(1, 9) },
                    { label: 'Tomorrow afternoon', time: getScheduleTime(1, 13) },
                    { label: 'Monday morning', time: getScheduleTime('monday', 9) },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => { setScheduledAt(opt.time); setShowSchedule(false) }}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-wm-text-secondary hover:bg-wm-surface-hover"
                    >
                      <Clock className="h-3 w-3 text-wm-text-muted" />
                      {opt.label}
                      <span className="flex-1" />
                      <span className="font-mono text-[10px] text-wm-text-muted">{formatSchedulePreview(opt.time)}</span>
                    </button>
                  ))}
                  <div className="border-t border-wm-border px-3 py-2">
                    <label className="font-mono text-[10px] text-wm-text-muted">Pick date & time</label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="mt-1 w-full bg-wm-bg border border-wm-border px-2 py-1.5 font-mono text-xs text-wm-text-primary outline-none"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={sending}
            className={cn(
              'flex items-center gap-1.5 bg-wm-accent px-3.5 py-1.5 font-mono text-xs font-semibold text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover',
              sending && 'opacity-50',
            )}
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? 'Sending...' : scheduledAt ? 'Schedule' : 'Send'}
          </button>
        </div>
      </div>
    </>
  )
}
