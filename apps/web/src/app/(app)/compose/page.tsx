'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Send, Trash2, Calendar, ArrowLeft, X,
  Bold, Italic, Underline, Strikethrough, Heading, List, ListOrdered, SquareCheck,
  Link2, Image, Paperclip, Code, Sparkles, FileText, PenLine,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'


type Mailbox = { id: string; address: string; displayName: string }

export default function ComposePage() {
  const router = useRouter()
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [fromMailboxId, setFromMailboxId] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [to, setTo] = useState('')
  const [toChips, setToChips] = useState<string[]>([])
  const [cc, setCc] = useState('')
  const [ccChips, setCcChips] = useState<string[]>([])
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [bcc, setBcc] = useState('')
  const [bccChips, setBccChips] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
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

  function handleBccKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault()
      addChip(bcc, bccChips, setBccChips, () => setBcc(''))
    }
  }

  async function handleSend() {
    // Add any typed-but-not-chipped emails
    const finalTo = [...toChips]
    if (to.trim() && to.includes('@')) finalTo.push(to.trim())

    if (finalTo.length === 0) {
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
        toAddresses: finalTo,
        cc: ccChips.length > 0 ? ccChips : undefined,
        bcc: bccChips.length > 0 ? bccChips : undefined,
        subject,
        textBody: body,
        mailboxId: fromMailboxId,
        send: true,
      })
      router.push('/inbox')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  async function handleSaveDraft() {
    if (!fromMailboxId) return
    try {
      await api.post('/api/v1/inbox/compose', {
        fromAddress,
        toAddresses: toChips,
        subject,
        textBody: body,
        mailboxId: fromMailboxId,
        send: false,
      })
      router.push('/inbox')
    } catch {}
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-wm-border px-6 py-3">
        <button onClick={() => router.back()} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-base font-semibold text-wm-text-primary">New Message</h1>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" icon={<Calendar className="h-3.5 w-3.5" />}>Schedule</Button>
        <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={handleSaveDraft}>Discard</Button>
        <Button variant="primary" size="sm" icon={<Send className="h-3.5 w-3.5" />} loading={sending} onClick={handleSend}>Send</Button>
      </div>

      {/* Fields */}
      <div className="flex flex-col border-b border-wm-border px-6">
        {/* From */}
        <div className="flex items-center gap-3 border-b border-wm-border py-2.5">
          <span className="w-14 font-mono text-xs font-medium text-wm-text-muted">From</span>
          <select
            value={fromMailboxId}
            onChange={(e) => {
              setFromMailboxId(e.target.value)
              const mb = mailboxes.find((m) => m.id === e.target.value)
              if (mb) setFromAddress(mb.address)
            }}
            className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary outline-none"
          >
            {mailboxes.map((mb) => (
              <option key={mb.id} value={mb.id}>{mb.address}</option>
            ))}
          </select>
        </div>

        {/* To */}
        <div className="flex items-center gap-3 border-b border-wm-border py-2.5">
          <span className="w-14 font-mono text-xs font-medium text-wm-text-muted">To</span>
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {toChips.map((chip) => (
              <span key={chip} className="flex items-center gap-1 border border-wm-border bg-wm-surface px-2 py-0.5 font-mono text-xs text-wm-text-primary">
                {chip}
                <X className="h-3 w-3 cursor-pointer text-wm-text-muted" onClick={() => setToChips(toChips.filter((c) => c !== chip))} />
              </span>
            ))}
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              onKeyDown={handleToKeyDown}
              onBlur={() => addChip(to, toChips, setToChips, () => setTo(''))}
              placeholder={toChips.length === 0 ? 'recipient@example.com' : ''}
              className="min-w-[150px] flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            />
          </div>
          {!showCc && <button onClick={() => setShowCc(true)} className="cursor-pointer font-mono text-[10px] text-wm-text-muted hover:text-wm-text-secondary">Cc</button>}
          {!showBcc && <button onClick={() => setShowBcc(true)} className="cursor-pointer font-mono text-[10px] text-wm-text-muted hover:text-wm-text-secondary">Bcc</button>}
        </div>

        {/* Cc */}
        {showCc && (
          <div className="flex items-center gap-3 border-b border-wm-border py-2.5">
            <span className="w-14 font-mono text-xs font-medium text-wm-text-muted">Cc</span>
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              {ccChips.map((chip) => (
                <span key={chip} className="flex items-center gap-1 border border-wm-border bg-wm-surface px-2 py-0.5 font-mono text-xs text-wm-text-primary">
                  {chip}
                  <X className="h-3 w-3 cursor-pointer text-wm-text-muted" onClick={() => setCcChips(ccChips.filter((c) => c !== chip))} />
                </span>
              ))}
              <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} onKeyDown={handleCcKeyDown} placeholder="Add recipients..." className="min-w-[150px] flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none" />
            </div>
          </div>
        )}

        {/* Bcc */}
        {showBcc && (
          <div className="flex items-center gap-3 border-b border-wm-border py-2.5">
            <span className="w-14 font-mono text-xs font-medium text-wm-text-muted">Bcc</span>
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              {bccChips.map((chip) => (
                <span key={chip} className="flex items-center gap-1 border border-wm-border bg-wm-surface px-2 py-0.5 font-mono text-xs text-wm-text-primary">
                  {chip}
                  <X className="h-3 w-3 cursor-pointer text-wm-text-muted" onClick={() => setBccChips(bccChips.filter((c) => c !== chip))} />
                </span>
              ))}
              <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} onKeyDown={handleBccKeyDown} placeholder="Add recipients..." className="min-w-[150px] flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none" />
            </div>
          </div>
        )}

        {/* Subject */}
        <div className="flex items-center gap-3 py-2.5">
          <span className="w-14 font-mono text-xs font-medium text-wm-text-muted">Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="flex-1 bg-transparent text-sm font-medium text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-wm-border px-6 py-1.5">
        {[Bold, Italic, Underline, Strikethrough].map((Icon, i) => (
          <button key={i} className="cursor-pointer p-1.5 text-wm-text-muted hover:text-wm-text-secondary"><Icon className="h-4 w-4" /></button>
        ))}
        <div className="h-4 w-px bg-wm-border" />
        {[Heading, List, ListOrdered, SquareCheck].map((Icon, i) => (
          <button key={i} className="cursor-pointer p-1.5 text-wm-text-muted hover:text-wm-text-secondary"><Icon className="h-4 w-4" /></button>
        ))}
        <div className="h-4 w-px bg-wm-border" />
        {[Link2, Image, Paperclip, Code].map((Icon, i) => (
          <button key={i} className="cursor-pointer p-1.5 text-wm-text-muted hover:text-wm-text-secondary"><Icon className="h-4 w-4" /></button>
        ))}
        <div className="h-4 w-px bg-wm-border" />
        <button className="flex cursor-pointer items-center gap-1 bg-wm-accent/10 px-2.5 py-1 text-wm-accent">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="font-mono text-[10px] font-medium">AI Assist</span>
        </button>
        <div className="flex-1" />
        <button className="flex cursor-pointer items-center gap-1 border border-wm-border px-2.5 py-1">
          <FileText className="h-3.5 w-3.5 text-wm-text-muted" />
          <span className="font-mono text-[10px] text-wm-text-muted">Snippets</span>
        </button>
        <button className="flex cursor-pointer items-center gap-1 border border-wm-border px-2.5 py-1 ml-1">
          <PenLine className="h-3.5 w-3.5 text-wm-text-muted" />
          <span className="font-mono text-[10px] text-wm-text-muted">Signature</span>
        </button>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your email..."
          className="h-full w-full resize-none bg-transparent text-sm leading-relaxed text-wm-text-secondary placeholder:text-wm-text-muted outline-none"
        />
      </div>

      {/* Footer hints */}
      {error && <div className="border-t border-wm-border px-6 py-2"><p className="font-mono text-xs text-wm-error">{error}</p></div>}
      <div className="flex items-center gap-4 border-t border-wm-border px-6 py-2">
        <div className="flex items-center gap-1.5">
          <span className="border border-wm-border px-1.5 py-0.5 font-mono text-[10px] text-wm-text-muted">/</span>
          <span className="font-mono text-[10px] text-wm-text-muted">Type / for slash commands: /ai, /template, /schedule, /signature</span>
        </div>
        <div className="flex-1" />
        <span className="font-mono text-[10px] text-wm-text-muted">Undo send available for 10 seconds after sending</span>
      </div>
    </div>
  )
}
