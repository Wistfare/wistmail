'use client'

import {
  BellOff,
  ChevronRight,
  FileText,
  Film,
  Hash,
  Image as ImageIcon,
  Phone,
  Pin,
  UserPlus,
  Video,
} from 'lucide-react'
import { cn, getInitials, stringToColor } from '@/lib/utils'

export interface ChatInfoPanelProps {
  kind: 'direct' | 'group'
  /** Direct: counterpart name. Group: group title. */
  title: string
  presence?: string
  avatarUrl?: string | null
  /** Direct: short subtitle line under the name (e.g. "Design Lead · @sarah"). */
  subtitle?: string
  /** Group only — list of recent / pinned member avatars. */
  members?: Array<{
    id: string
    name: string
    avatarUrl?: string | null
    role?: string
  }>
  /** Pinned items shown in the top "PINNED" section. */
  pinned?: Array<{
    id: string
    title: string
    by?: string
    when?: string
  }>
  /** "Files" tab content — file attachments shared in the conversation. */
  files?: Array<{ id: string; name: string; ext?: string; sizeBytes?: number }>
  links?: Array<{ id: string; title: string; href: string }>
  /** Optional bottom area for actions (e.g. start meeting). */
  footer?: React.ReactNode
  onAddMember?: () => void
  onCall?: () => void
  onVideo?: () => void
  onMute?: () => void
  onPin?: () => void
  className?: string
}

/**
 * Right-rail profile / member panel — Pencil reference: `ChatViewV3`
 * `InfoPanel` (`gFZ2m`).
 *
 *   profSec (padding [28,20,20,20], gap 10, alignItems center):
 *     80×80 round avatar — direct → coloured initials; group → hash
 *     name 18/700 white
 *     subtitle 11/500 #6e6e6e
 *     ACTIVE NOW pill (radius 14, padding [5,12], 1px lime border,
 *       bg #1A2200, 6×6 lime dot + "ACTIVE NOW" 9/700 lime tracking 1.5)
 *
 *   qaRow (gap 8, padding [0,20,20,20]):
 *     4 surface tiles (radius 12, bg #111111, padding [10, 0]):
 *       phone · video · mute · pin — icon 16 white + label 9/700 #999999 tracking 1
 *
 *   1px hairline #1A1A1A
 *
 *   pinSec (padding [16,20], gap 10):
 *     header — "PINNED · 2" 9/700 #6e6e6e tracking 1.5 ↔ chevron-right 12 #6e6e6e
 *     pin row — radius 10, bg #111111, 3px lime LEFT stroke, padding [10,12]
 *       pin 11 lime + col(title 11/600 white + "by · when" 9/500 #6e6e6e)
 *
 *   mediaSec (padding [8,20,16,20], gap 10):
 *     header — "SHARED MEDIA · N" + lime "SEE ALL" 9/700 tracking 1
 *     mGrid (gap 6) — 3 80×80 tiles, coloured fills + icon 18:
 *       film @ #FF4D8B / #3A0A2A · image @ #3B82F6 / #1A2A4A · file-text @ #F59E0B / #3A2A0A
 *
 *   1px hairline
 *
 *   fileSec (padding [16,20], gap 10):
 *     header — "FILES · N" + chevron-right
 *     file row — radius 10, bg #111111, padding [8,10], gap 10:
 *       30×30 coloured tile + col(name 11/600 white + "size · when" 9/500 #6e6e6e)
 */
export function ChatInfoPanel({
  kind,
  title,
  presence,
  avatarUrl,
  subtitle,
  members = [],
  pinned = [],
  files = [],
  links = [],
  footer,
  onAddMember,
  onCall,
  onVideo,
  onMute,
  onPin,
  className,
}: ChatInfoPanelProps) {
  const live = !!presence && /active|online|now|typing/i.test(presence)
  const bg = stringToColor(title)
  const initials = getInitials(title)

  return (
    <aside
      className={cn(
        'flex w-[358px] shrink-0 flex-col overflow-y-auto',
        className,
      )}
      style={{ background: '#000000', borderLeft: '1px solid var(--color-wm-border)' }}
    >
      {/* profSec */}
      <div
        className="flex w-full flex-col items-center text-center"
        style={{ gap: 10, padding: '28px 20px 20px 20px' }}
      >
        {kind === 'group' ? (
          <span
            aria-hidden
            className="flex items-center justify-center rounded-full text-white"
            style={{ width: 80, height: 80, background: '#6D4AD4' }}
          >
            <Hash style={{ width: 36, height: 36 }} />
          </span>
        ) : avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="rounded-full object-cover"
            style={{ width: 80, height: 80 }}
          />
        ) : (
          <span
            aria-hidden
            className="flex items-center justify-center rounded-full font-mono font-bold text-white"
            style={{
              width: 80,
              height: 80,
              fontSize: 28,
              backgroundColor: bg,
            }}
          >
            {initials || '?'}
          </span>
        )}
        <h3
          className="font-mono font-bold text-wm-text-primary"
          style={{ fontSize: 18 }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            className="font-mono"
            style={{ fontSize: 11, fontWeight: 500, color: '#6e6e6e' }}
          >
            {subtitle}
          </p>
        )}
        {presence && (
          <span
            className="inline-flex items-center font-mono font-bold uppercase"
            style={{
              gap: 6,
              padding: '5px 12px',
              fontSize: 9,
              letterSpacing: 1.5,
              borderRadius: 14,
              background: live ? 'var(--color-wm-accent-dim)' : '#111111',
              color: live ? 'var(--color-wm-accent)' : '#6e6e6e',
              border: live
                ? '1px solid var(--color-wm-accent)'
                : '1px solid var(--color-wm-border)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: live ? 'var(--color-wm-accent)' : '#6e6e6e',
              }}
            />
            {presence}
          </span>
        )}
      </div>

      {/* qaRow */}
      <div
        className="flex w-full"
        style={{ gap: 8, padding: '0 20px 20px 20px' }}
      >
        <QaTile label="Call" icon={<Phone style={{ width: 16, height: 16 }} />} onClick={onCall} />
        <QaTile label="Video" icon={<Video style={{ width: 16, height: 16 }} />} onClick={onVideo} />
        <QaTile label="Mute" icon={<BellOff style={{ width: 16, height: 16 }} />} onClick={onMute} />
        <QaTile label="Pin" icon={<Pin style={{ width: 16, height: 16 }} />} onClick={onPin} />
        {kind === 'group' && (
          <QaTile
            label="Add"
            icon={<UserPlus style={{ width: 16, height: 16 }} />}
            onClick={onAddMember}
          />
        )}
      </div>

      <span
        aria-hidden
        style={{ height: 1, background: 'var(--color-wm-border)' }}
      />

      {/* Members section — group only. Lives between qaRow and Pinned in
          Pencil GroupChatV3; we leave the 6-member preview here. */}
      {kind === 'group' && members.length > 0 && (
        <Section
          label={`Members · ${members.length}`}
          padding="16px 20px"
        >
          <ul className="flex flex-col" style={{ gap: 6 }}>
            {members.slice(0, 6).map((m) => {
              const mInit = getInitials(m.name)
              const mBg = stringToColor(m.name)
              return (
                <li
                  key={m.id}
                  className="flex items-center"
                  style={{ gap: 10 }}
                >
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatarUrl}
                      alt=""
                      className="rounded-full object-cover"
                      style={{ width: 28, height: 28 }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex shrink-0 items-center justify-center rounded-full font-mono font-bold text-white"
                      style={{
                        width: 28,
                        height: 28,
                        fontSize: 10,
                        backgroundColor: mBg,
                      }}
                    >
                      {mInit || '?'}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className="truncate font-mono text-wm-text-primary"
                      style={{ fontSize: 12, fontWeight: 600 }}
                    >
                      {m.name}
                    </span>
                    {m.role && (
                      <span
                        className="font-mono"
                        style={{ fontSize: 10, color: '#6e6e6e' }}
                      >
                        {m.role}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
            {members.length > 6 && (
              <li
                className="font-mono"
                style={{ fontSize: 10, color: '#6e6e6e', padding: '0 4px' }}
              >
                +{members.length - 6} more
              </li>
            )}
          </ul>
        </Section>
      )}

      {/* PINNED section */}
      {pinned.length > 0 && (
        <Section
          label={`Pinned · ${pinned.length}`}
          padding="16px 20px"
          chevron
        >
          <div className="flex flex-col" style={{ gap: 6 }}>
            {pinned.slice(0, 3).map((p) => (
              <div
                key={p.id}
                className="flex"
                style={{
                  gap: 8,
                  padding: '10px 12px',
                  background: '#111111',
                  borderRadius: 10,
                  borderLeft: '3px solid var(--color-wm-accent)',
                }}
              >
                <Pin
                  style={{
                    width: 11,
                    height: 11,
                    color: 'var(--color-wm-accent)',
                    marginTop: 2,
                    flexShrink: 0,
                  }}
                />
                <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
                  <span
                    className="truncate font-mono text-wm-text-primary"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {p.title}
                  </span>
                  {(p.by || p.when) && (
                    <span
                      className="font-mono"
                      style={{ fontSize: 9, fontWeight: 500, color: '#6e6e6e' }}
                    >
                      {[p.by, p.when].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* SHARED MEDIA section — Pencil renders a 3-tile preview; if no
          attachments are surfaced yet we leave the section out. */}
      {/* TODO(media-preview): once chat queries return media descriptors
          (file mime/url) wire real thumbnails into the grid. For now we
          render a placeholder using the file list's images/videos. */}
      {files.some((f) =>
        /\.(png|jpe?g|gif|webp|mp4|mov|avi)$/i.test(f.name),
      ) && (
        <Section
          label={`Shared media · ${files.filter((f) => /\.(png|jpe?g|gif|webp|mp4|mov|avi)$/i.test(f.name)).length}`}
          padding="8px 20px 16px 20px"
          rightAction="See all"
        >
          <div className="grid grid-cols-3" style={{ gap: 6 }}>
            {files
              .filter((f) =>
                /\.(png|jpe?g|gif|webp|mp4|mov|avi)$/i.test(f.name),
              )
              .slice(0, 3)
              .map((f) => {
                const isVideo = /\.(mp4|mov|avi|webm)$/i.test(f.name)
                return (
                  <div
                    key={f.id}
                    aria-label={f.name}
                    className="flex items-center justify-center"
                    style={{
                      height: 80,
                      borderRadius: 8,
                      background: isVideo ? '#3A0A2A' : '#1A2A4A',
                    }}
                  >
                    {isVideo ? (
                      <Film
                        style={{ width: 18, height: 18, color: '#FF4D8B' }}
                      />
                    ) : (
                      <ImageIcon
                        style={{ width: 18, height: 18, color: '#3B82F6' }}
                      />
                    )}
                  </div>
                )
              })}
          </div>
        </Section>
      )}

      <span
        aria-hidden
        style={{ height: 1, background: 'var(--color-wm-border)' }}
      />

      {/* FILES section */}
      {files.length > 0 && (
        <Section
          label={`Files · ${files.length}`}
          padding="16px 20px"
          chevron
        >
          <div className="flex flex-col" style={{ gap: 6 }}>
            {files.slice(0, 5).map((f) => (
              <div
                key={f.id}
                className="flex items-center"
                style={{
                  gap: 10,
                  padding: '8px 10px',
                  background: '#111111',
                  borderRadius: 10,
                }}
              >
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    background: '#3A2A0A',
                  }}
                >
                  <FileText
                    style={{ width: 13, height: 13, color: '#F59E0B' }}
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 1 }}>
                  <span
                    className="truncate font-mono text-wm-text-primary"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {f.name}
                  </span>
                  {f.sizeBytes && (
                    <span
                      className="font-mono"
                      style={{ fontSize: 9, fontWeight: 500, color: '#6e6e6e' }}
                    >
                      {formatBytes(f.sizeBytes)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {links.length > 0 && (
        <Section
          label={`Pinned links · ${links.length}`}
          padding="16px 20px"
        >
          <ul className="flex flex-col">
            {links.slice(0, 5).map((l) => (
              <li
                key={l.id}
                className="flex items-center border-b border-wm-border py-2 last:border-b-0"
                style={{ gap: 8 }}
              >
                <Pin style={{ width: 11, height: 11, color: '#6e6e6e' }} />
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-mono text-wm-accent hover:underline"
                  style={{ fontSize: 11 }}
                >
                  {l.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {footer && <div className="mt-auto" style={{ padding: '16px 20px' }}>{footer}</div>}
    </aside>
  )
}

function Section({
  label,
  padding,
  chevron,
  rightAction,
  children,
}: {
  label: string
  padding: string
  chevron?: boolean
  rightAction?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex w-full flex-col" style={{ gap: 10, padding }}>
      <header className="flex w-full items-center justify-between">
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
        >
          {label}
        </span>
        {chevron && <ChevronRight style={{ width: 12, height: 12, color: '#6e6e6e' }} />}
        {rightAction && (
          <span
            className="font-mono font-bold uppercase text-wm-accent"
            style={{ fontSize: 9, letterSpacing: 1 }}
          >
            {rightAction}
          </span>
        )}
      </header>
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

function QaTile({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-1 cursor-pointer flex-col items-center justify-center transition-colors hover:bg-wm-surface-hover"
      style={{
        gap: 5,
        padding: '10px 0',
        background: '#111111',
        borderRadius: 12,
      }}
    >
      <span style={{ color: '#FFFFFF' }}>{icon}</span>
      <span
        className="font-mono font-bold uppercase"
        style={{ fontSize: 9, letterSpacing: 1, color: '#999999' }}
      >
        {label}
      </span>
    </button>
  )
}
