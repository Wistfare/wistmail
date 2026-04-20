'use client'

import { useState } from 'react'
import {
  Calendar,
  Check,
  Download,
  File,
  FileImage,
  FileText,
  FileVideo,
  HelpCircle,
  MapPin,
  X,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import type { ParsedIcs } from '@/lib/email-queries'

interface Attachment {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
  parsedIcs?: ParsedIcs
  rsvpResponse?: 'accept' | 'tentative' | 'decline' | null
}

/// Full attachment chip strip rendered in the email-detail header.
/// Each chip = type-icon + filename + size, click = download.
/// Calendar invites (.ics / text/calendar) get a separate ICS card
/// rendered above the strip — if the server parsed it successfully we
/// render title/time/location + working RSVP buttons, otherwise we
/// fall back to the generic placeholder.
export function AttachmentsStrip({
  emailId,
  attachments,
}: {
  emailId: string
  attachments: Attachment[]
}) {
  if (attachments.length === 0) return null
  const totalSize = attachments.reduce((sum, a) => sum + a.sizeBytes, 0)
  const ics = attachments.find(
    (a) =>
      a.contentType.toLowerCase().includes('text/calendar') ||
      a.filename.toLowerCase().endsWith('.ics'),
  )
  const others = attachments.filter((a) => a !== ics)

  return (
    <div className="flex flex-col gap-3 border-b border-wm-border px-6 py-3">
      <div className="flex items-center gap-2">
        <Download className="h-3 w-3 text-wm-text-muted" />
        <span className="font-mono text-[10px] font-bold uppercase text-wm-text-muted">
          {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
          {' · '}
          {formatBytes(totalSize)}
        </span>
      </div>

      {ics && <IcsCard emailId={emailId} attachment={ics} />}

      {others.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {others.map((a) => (
            <AttachmentChip key={a.id} attachment={a} />
          ))}
        </div>
      )}
    </div>
  )
}

/// Compact paperclip badge for the inbox row. Shown only when the
/// row has at least one attachment; collapses otherwise.
export function AttachmentBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 border border-wm-border bg-wm-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-wm-text-secondary">
      <Paperclip className="h-2.5 w-2.5" />
      {count}
    </span>
  )
}

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const Icon = iconFor(attachment.contentType, attachment.filename)
  const iconColor = colorFor(attachment.contentType, attachment.filename)
  return (
    <a
      href={`/api/v1/inbox/attachments/${attachment.id}/download`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-fit min-w-[200px] max-w-[280px] items-center gap-3 border border-wm-border bg-wm-surface px-3 py-2.5 transition-colors hover:bg-wm-surface-hover"
      title={`Download ${attachment.filename}`}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: iconColor }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-wm-text-primary">
          {attachment.filename}
        </p>
        <p className="font-mono text-[10px] text-wm-text-muted">
          {formatBytes(attachment.sizeBytes)}
        </p>
      </div>
    </a>
  )
}

type RsvpResponse = 'accept' | 'tentative' | 'decline'

function IcsCard({
  emailId,
  attachment,
}: {
  emailId: string
  attachment: Attachment
}) {
  const parsed = attachment.parsedIcs
  // Seed from the server-persisted choice so navigating away and back
  // preserves "You accepted this" without the user having to re-send.
  const [lastResponse, setLastResponse] = useState<RsvpResponse | null>(
    (attachment.rsvpResponse as RsvpResponse | null | undefined) ?? null,
  )
  const [sending, setSending] = useState<RsvpResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Organizer email is required to produce a valid REPLY — without it
  // there's no one to send the response to. Disable buttons but still
  // render the metadata card so the user sees the event details.
  const canRsvp = Boolean(parsed?.organizer?.email)

  async function rsvp(response: RsvpResponse) {
    if (sending) return
    setSending(response)
    setError(null)
    try {
      await api.post(
        `/api/v1/inbox/emails/${emailId}/attachments/${attachment.id}/rsvp`,
        { response },
      )
      setLastResponse(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send RSVP')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="border border-wm-accent bg-wm-accent/10 p-3">
      <div className="flex items-start gap-3">
        <Calendar className="h-5 w-5 shrink-0 text-wm-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-wm-text-primary">
            {parsed?.summary || 'Calendar invite'}
          </p>
          {parsed?.startAt ? (
            <p className="text-[12px] text-wm-text-secondary">
              {formatInviteTime(parsed.startAt, parsed.endAt, parsed.allDay)}
            </p>
          ) : null}
          {parsed?.location ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-wm-text-muted">
              <MapPin className="h-3 w-3 shrink-0" />
              {parsed.location}
            </p>
          ) : null}
          {parsed?.organizer?.email ? (
            <p className="mt-0.5 font-mono text-[10px] text-wm-text-muted">
              from {parsed.organizer.name || parsed.organizer.email}
            </p>
          ) : (
            <p className="font-mono text-[11px] text-wm-text-muted">
              {attachment.filename} · {formatBytes(attachment.sizeBytes)}
            </p>
          )}
        </div>
        <a
          href={`/api/v1/inbox/attachments/${attachment.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer font-mono text-[11px] font-semibold text-wm-accent hover:underline"
        >
          Open
        </a>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RsvpButton
          label="Yes"
          icon={<Check className="h-3 w-3" />}
          active={lastResponse === 'accept'}
          loading={sending === 'accept'}
          disabled={!canRsvp || sending !== null}
          onClick={() => rsvp('accept')}
        />
        <RsvpButton
          label="Maybe"
          icon={<HelpCircle className="h-3 w-3" />}
          active={lastResponse === 'tentative'}
          loading={sending === 'tentative'}
          disabled={!canRsvp || sending !== null}
          onClick={() => rsvp('tentative')}
        />
        <RsvpButton
          label="No"
          icon={<X className="h-3 w-3" />}
          active={lastResponse === 'decline'}
          loading={sending === 'decline'}
          disabled={!canRsvp || sending !== null}
          onClick={() => rsvp('decline')}
        />
        {lastResponse ? (
          <span className="font-mono text-[10px] font-semibold uppercase text-wm-success">
            RSVP sent · {labelFor(lastResponse)}
          </span>
        ) : null}
        {!canRsvp ? (
          <span className="font-mono text-[10px] uppercase text-wm-text-muted">
            No organizer — can't reply
          </span>
        ) : null}
        {error ? (
          <span className="font-mono text-[10px] uppercase text-wm-danger">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function RsvpButton({
  label,
  icon,
  active,
  loading,
  disabled,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  loading: boolean
  disabled: boolean
  onClick: () => void
}) {
  const base =
    'inline-flex items-center gap-1 px-3 py-1 font-mono text-[11px] font-semibold transition-colors'
  const style = active
    ? 'bg-wm-accent text-white'
    : disabled
      ? 'border border-wm-border text-wm-text-muted cursor-not-allowed'
      : 'border border-wm-border text-wm-text-secondary hover:bg-wm-surface-hover cursor-pointer'
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} ${style}`}>
      {loading ? <span className="h-3 w-3 animate-pulse">·</span> : icon}
      {label}
    </button>
  )
}

function labelFor(r: RsvpResponse): string {
  return r === 'accept' ? 'Accepted' : r === 'tentative' ? 'Tentative' : 'Declined'
}

function formatInviteTime(
  startAt: string,
  endAt: string | null,
  allDay: boolean,
): string {
  const start = new Date(startAt)
  if (Number.isNaN(start.getTime())) return ''
  const end = endAt ? new Date(endAt) : null
  const dateFmt: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }
  const timeFmt: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
  if (allDay) {
    return start.toLocaleDateString(undefined, dateFmt) + ' · all day'
  }
  const datePart = start.toLocaleDateString(undefined, dateFmt)
  const startTime = start.toLocaleTimeString(undefined, timeFmt)
  if (end) {
    const sameDay = start.toDateString() === end.toDateString()
    const endTime = end.toLocaleTimeString(undefined, timeFmt)
    return sameDay
      ? `${datePart} · ${startTime} – ${endTime}`
      : `${datePart} ${startTime} → ${end.toLocaleDateString(undefined, dateFmt)} ${endTime}`
  }
  return `${datePart} · ${startTime}`
}

function iconFor(contentType: string, filename: string) {
  const ct = contentType.toLowerCase()
  const fn = filename.toLowerCase()
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(fn)) {
    return FileImage
  }
  if (ct.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/.test(fn)) {
    return FileVideo
  }
  if (ct === 'application/pdf' || fn.endsWith('.pdf')) {
    return FileText
  }
  if (ct.startsWith('text/') || /\.(txt|md|csv)$/.test(fn)) {
    return FileText
  }
  return File
}

function colorFor(contentType: string, filename: string): string {
  const ct = contentType.toLowerCase()
  const fn = filename.toLowerCase()
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(fn)) {
    return '#3B82F6' // blue
  }
  if (ct === 'application/pdf' || fn.endsWith('.pdf')) {
    return '#EF4444' // red
  }
  if (ct.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/.test(fn)) {
    return '#A78BFA' // purple
  }
  return '#94A3B8' // slate
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Inline Paperclip import to avoid an extra named import in
// consumers that only need AttachmentBadge.
function Paperclip(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m21 8.5-9.07 9.07a4.95 4.95 0 0 1-7-7l9.07-9.07a3.3 3.3 0 0 1 4.66 4.66L9.66 14.16a1.65 1.65 0 0 1-2.33-2.33L15.5 3.66" />
    </svg>
  )
}
