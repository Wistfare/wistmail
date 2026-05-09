'use client'

import { Hash, MoreHorizontal, Phone, Search, Video } from 'lucide-react'
import { Avatar, IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface ConversationHeaderProps {
  kind: 'direct' | 'group'
  /** Counterpart name or group title. */
  title: string
  /** Online indicator / "typing…" / "last seen 5m ago". */
  presence?: string
  avatarUrl?: string | null
  /** Hide call buttons (e.g. for group rooms without dial-in). */
  hideCallActions?: boolean
  onCall?: () => void
  onVideo?: () => void
  onSearch?: () => void
  onMore?: () => void
  className?: string
}

/**
 * V3 thread header — top bar of the reading pane.
 *
 * Pencil reference: `ChatViewV3` header (`X1Safv`).
 *   [avatar] Name        ← presence
 *                              [📞] [📹] [🔍] [⋯]
 */
export function ConversationHeader({
  kind,
  title,
  presence,
  avatarUrl,
  hideCallActions,
  onCall,
  onVideo,
  onSearch,
  onMore,
  className,
}: ConversationHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-4 border-b border-wm-border bg-wm-bg px-6 py-3',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {kind === 'group' ? (
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wm-accent-dim text-wm-accent"
          >
            <Hash className="h-5 w-5" />
          </span>
        ) : (
          <Avatar name={title} src={avatarUrl ?? undefined} size="md" />
        )}
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate font-sans text-sm font-semibold text-wm-text-primary">
            {title}
          </h2>
          {presence && (
            <p className="truncate font-mono text-[10px] text-wm-text-tertiary">
              {presence}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {!hideCallActions && (
          <>
            <IconButton aria-label="Voice call" onClick={onCall}>
              <Phone className="h-4 w-4" />
            </IconButton>
            <IconButton aria-label="Video call" onClick={onVideo}>
              <Video className="h-4 w-4" />
            </IconButton>
          </>
        )}
        <IconButton aria-label="Search messages" onClick={onSearch}>
          <Search className="h-4 w-4" />
        </IconButton>
        <IconButton aria-label="More" onClick={onMore}>
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
      </div>
    </header>
  )
}
