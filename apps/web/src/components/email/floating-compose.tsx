'use client'

import { useState, useEffect } from 'react'
import {
  Send, Trash2, X, Minus, Maximize2, Minimize2,
  Bold, Italic, Underline, Link2, Paperclip,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

type Mailbox = { id: string; address: string; displayName: string }

export type ComposeData = {
  to?: string[]
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
  const [to, setTo] = useState('')
  const [toChips, setToChips] = useState<string[]>(initialData?.to || [])
  const [cc, setCc] = useState('')
  const [ccChips, setCcChips] = useState<string[]>([])
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(initialData?.subject || '')
  const [body, setBody] = useState(initialData?.body || '')
  const [inReplyTo] = useState(initialData?.inReplyTo || '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ data: Mailbox[] }>('/api/v1/setup/mailboxes').then((res) => {
      if (res.data.length > 0) {
        setMailboxes(res.data)
        setFromMailboxId(res.data[0].id)
        setFromAddress(res.data[0].address)
      }
    })
  }, [])

  function addChip(value: string, chips: string[], setChips: (c: string[]) => void, clear: () => void) {
    const trimmed = value.trim()
    if (trimmed && trimmed.includes('@') && !chips.includes(trimmed)) {
      setChips([...chips, trimmed])
      clear()
    }
  }

  function handleToKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault()
      addChip(to, toChips, setToChips, () => setTo(''))
    }
  }

  function handleCcKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault()
      addChip(cc, ccChips, setCcChips, () => setCc(''))
    }
  }

  async function handleSend() {
    const finalTo = [...toChips]
    if (to.trim() && to.includes('@')) finalTo.push(to.trim())
    if (finalTo.length === 0) { setError('At least one recipient is required'); return }
    if (!subject.trim()) { setError('Subject is required'); return }

    setSending(true)
    setError('')
    try {
      await api.post('/api/v1/inbox/compose', {
        fromAddress,
        toAddresses: finalTo,
        cc: ccChips.length > 0 ? ccChips : undefined,
        subject,
        textBody: body,
        mailboxId: fromMailboxId,
        inReplyTo: inReplyTo || undefined,
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

        {/* To */}
        <div className="flex items-center gap-2 border-b border-wm-border px-4 py-2">
          <span className="w-14 font-mono text-[11px] text-wm-text-muted">To</span>
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {toChips.map((chip) => (
              <span key={chip} className="flex items-center gap-1 border border-wm-border px-1.5 py-0.5 font-mono text-[10px] text-wm-text-primary">
                {chip}
                <X className="h-2.5 w-2.5 cursor-pointer text-wm-text-muted" onClick={() => setToChips(toChips.filter((c) => c !== chip))} />
              </span>
            ))}
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onKeyDown={handleToKeyDown}
              onBlur={() => addChip(to, toChips, setToChips, () => setTo(''))}
              placeholder={toChips.length === 0 ? 'recipient@example.com' : ''}
              className="min-w-[100px] flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            />
          </div>
          {!showCc && (
            <button onClick={() => setShowCc(true)} className="cursor-pointer font-mono text-[10px] text-wm-text-muted hover:text-wm-text-secondary">Cc</button>
          )}
        </div>

        {/* Cc (optional) */}
        {showCc && (
          <div className="flex items-center gap-2 border-b border-wm-border px-4 py-2">
            <span className="w-14 font-mono text-[11px] text-wm-text-muted">Cc</span>
            <div className="flex flex-1 flex-wrap items-center gap-1">
              {ccChips.map((chip) => (
                <span key={chip} className="flex items-center gap-1 border border-wm-border px-1.5 py-0.5 font-mono text-[10px] text-wm-text-primary">
                  {chip}
                  <X className="h-2.5 w-2.5 cursor-pointer text-wm-text-muted" onClick={() => setCcChips(ccChips.filter((c) => c !== chip))} />
                </span>
              ))}
              <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} onKeyDown={handleCcKeyDown} placeholder="Add Cc..." className="min-w-[100px] flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none" />
            </div>
          </div>
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
          <button
            onClick={handleSend}
            disabled={sending}
            className={cn(
              'flex items-center gap-1.5 bg-wm-accent px-3.5 py-1.5 font-mono text-xs font-semibold text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover',
              sending && 'opacity-50',
            )}
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </>
  )
}
