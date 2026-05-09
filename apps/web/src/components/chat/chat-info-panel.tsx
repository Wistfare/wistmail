'use client'

import { FileText, Hash, Link as LinkIcon, Phone, Pin, UserPlus, Video } from 'lucide-react'
import { Avatar, IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface ChatInfoPanelProps {
  kind: 'direct' | 'group'
  /** Direct: counterpart name. Group: group title. */
  title: string
  presence?: string
  avatarUrl?: string | null
  /** Group only — list of recent / pinned member avatars. */
  members?: Array<{ id: string; name: string; avatarUrl?: string | null; role?: string }>
  /** "Files" tab content — file attachments shared in the conversation. */
  files?: Array<{ id: string; name: string; ext?: string; sizeBytes?: number }>
  links?: Array<{ id: string; title: string; href: string }>
  /** Optional bottom area for actions (e.g. start meeting). */
  footer?: React.ReactNode
  onAddMember?: () => void
  onCall?: () => void
  onVideo?: () => void
  className?: string
}

/**
 * Right-rail profile / member panel.
 *
 * Pencil reference: `ChatViewV3` and `GroupChatV3` right column
 * (~280px) — large avatar / hash icon, presence, primary actions, then
 * Files / Links sections.
 */
export function ChatInfoPanel({
  kind,
  title,
  presence,
  avatarUrl,
  members = [],
  files = [],
  links = [],
  footer,
  onAddMember,
  onCall,
  onVideo,
  className,
}: ChatInfoPanelProps) {
  return (
    <aside
      className={cn(
        'flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l border-wm-border bg-wm-bg p-5',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        {kind === 'group' ? (
          <span
            aria-hidden
            className="flex h-20 w-20 items-center justify-center rounded-full bg-wm-accent-dim text-wm-accent"
          >
            <Hash className="h-9 w-9" />
          </span>
        ) : (
          <Avatar name={title} src={avatarUrl ?? undefined} size="lg" className="h-20 w-20 text-2xl" />
        )}
        <h3 className="font-sans text-base font-semibold text-wm-text-primary">{title}</h3>
        {presence && (
          <p className="font-mono text-[11px] text-wm-text-tertiary">{presence}</p>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <IconButton aria-label="Voice call" variant="surface" onClick={onCall}>
          <Phone className="h-4 w-4" />
        </IconButton>
        <IconButton aria-label="Video call" variant="surface" onClick={onVideo}>
          <Video className="h-4 w-4" />
        </IconButton>
        {kind === 'group' && (
          <IconButton aria-label="Add member" variant="surface" onClick={onAddMember}>
            <UserPlus className="h-4 w-4" />
          </IconButton>
        )}
      </div>

      {kind === 'group' && members.length > 0 && (
        <Section label={`Members · ${members.length}`}>
          <ul className="flex flex-col gap-1">
            {members.slice(0, 6).map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <Avatar name={m.name} src={m.avatarUrl ?? undefined} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-sans text-[12px] text-wm-text-primary">
                    {m.name}
                  </span>
                  {m.role && (
                    <span className="font-mono text-[10px] text-wm-text-tertiary">
                      {m.role}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {members.length > 6 && (
              <li className="px-1 font-mono text-[10px] text-wm-text-tertiary">
                +{members.length - 6} more
              </li>
            )}
          </ul>
        </Section>
      )}

      {files.length > 0 && (
        <Section label={`Shared files · ${files.length}`}>
          <ul className="flex flex-col">
            {files.slice(0, 5).map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 border-b border-wm-border py-2 last:border-b-0"
              >
                <FileText className="h-3.5 w-3.5 text-wm-text-muted" />
                <span className="truncate font-mono text-[11px] text-wm-text-secondary">
                  {f.name}
                </span>
                {f.sizeBytes && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-wm-text-tertiary">
                    {formatBytes(f.sizeBytes)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {links.length > 0 && (
        <Section label={`Pinned links · ${links.length}`}>
          <ul className="flex flex-col">
            {links.slice(0, 5).map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-2 border-b border-wm-border py-2 last:border-b-0"
              >
                <LinkIcon className="h-3.5 w-3.5 text-wm-text-muted" />
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-mono text-[11px] text-wm-accent hover:underline"
                >
                  {l.title}
                </a>
                <Pin className="ml-auto h-3 w-3 shrink-0 text-wm-text-muted" />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {footer && <div className="mt-auto">{footer}</div>}
    </aside>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
        {label}
      </h4>
      {children}
    </section>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}
