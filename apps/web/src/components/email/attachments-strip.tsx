'use client'

import {
  Calendar,
  Download,
  File,
  FileImage,
  FileText,
  FileVideo,
} from 'lucide-react'

interface Attachment {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
}

/// Full attachment chip strip rendered in the email-detail header.
/// Each chip = type-icon + filename + size, click = download.
/// Calendar invites (.ics / text/calendar) get a separate ICS card
/// rendered above the strip with title/time/RSVP placeholders.
export function AttachmentsStrip({
  attachments,
}: {
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

      {ics && <IcsCard attachment={ics} />}

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

function IcsCard({ attachment }: { attachment: Attachment }) {
  // Without the bytes we can't parse summary/dtstart/dtend yet, so
  // we render a compact "calendar invite" card with a download link.
  // When the mail-engine starts streaming bytes, we'll parse client-
  // side and replace this with the rich title/time/RSVP rendering.
  return (
    <div className="border border-wm-accent bg-wm-accent/10 p-3">
      <div className="flex items-start gap-3">
        <Calendar className="h-5 w-5 shrink-0 text-wm-accent" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-wm-text-primary">
            Calendar invite
          </p>
          <p className="font-mono text-[11px] text-wm-text-muted">
            {attachment.filename} · {formatBytes(attachment.sizeBytes)}
          </p>
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
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="cursor-not-allowed bg-wm-accent/30 px-3 py-1 font-mono text-[11px] font-semibold text-wm-accent"
          disabled
          title="RSVP isn't wired yet"
        >
          Yes
        </button>
        <button
          type="button"
          className="cursor-not-allowed border border-wm-border px-3 py-1 font-mono text-[11px] font-semibold text-wm-text-muted"
          disabled
          title="RSVP isn't wired yet"
        >
          Maybe
        </button>
        <button
          type="button"
          className="cursor-not-allowed border border-wm-border px-3 py-1 font-mono text-[11px] font-semibold text-wm-text-muted"
          disabled
          title="RSVP isn't wired yet"
        >
          No
        </button>
      </div>
    </div>
  )
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
