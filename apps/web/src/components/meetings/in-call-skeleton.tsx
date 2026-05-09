'use client'

import { Mic, MicOff, Monitor, MoreHorizontal, PhoneOff, Video, VideoOff } from 'lucide-react'
import { useState } from 'react'
import type { CalendarEvent } from '@/lib/event-queries'
import { cn } from '@/lib/utils'

export interface InCallSkeletonProps {
  meeting: CalendarEvent
  onLeave?: () => void
  className?: string
}

/**
 * In-call placeholder UI.
 *
 * Pencil reference: `MeetingsV3-InCall` (`t0tR0`). Real WebRTC isn't
 * wired yet — clicking "Join meeting" on the hero card opens the
 * external `meetingLink` in a new tab. This page renders the V3 chrome
 * (main speaker tile + participant strip + control bar) so the layout
 * exists for when the media plane lands.
 */
export function InCallSkeleton({ meeting, onLeave, className }: InCallSkeletonProps) {
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)

  const attendees = meeting.attendees.slice(0, 4)

  return (
    <div className={cn('flex h-full flex-col bg-wm-bg', className)}>
      <header className="flex items-center justify-between gap-3 border-b border-wm-border px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-wm-error/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-error">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-wm-error" />
            Live
          </span>
          <span className="font-sans text-sm font-semibold text-wm-text-primary">
            {meeting.title}
          </span>
        </div>
        <span className="font-mono text-[11px] text-wm-text-tertiary">
          00:00:00
        </span>
      </header>

      <div className="flex flex-1 gap-3 overflow-hidden p-3">
        {/* Main speaker tile */}
        <div
          className={cn(
            'flex flex-1 items-center justify-center rounded-2xl border-2 bg-wm-surface',
            'border-wm-accent',
          )}
          style={{ boxShadow: '0 0 0 1px rgba(191,255,0,0.25) inset' }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-wm-error font-sans text-4xl font-bold text-white">
              {(attendees[0]?.[0] ?? '?').toUpperCase()}
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[1.5px] text-wm-text-tertiary">
              {attendees[0] ?? 'Awaiting attendees'}
            </p>
          </div>
        </div>

        {/* Participant strip */}
        <aside className="flex w-44 flex-col gap-3">
          {attendees.slice(1).map((a, i) => (
            <div
              key={a}
              className="flex flex-1 items-center justify-center rounded-xl bg-wm-surface"
            >
              <div
                className="flex h-16 w-16 items-center justify-center rounded-full font-sans text-xl font-bold text-white"
                style={{ backgroundColor: rotatingColor(i) }}
              >
                {(a[0] ?? '?').toUpperCase()}
              </div>
            </div>
          ))}
          {attendees.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-wm-border bg-wm-surface px-3 text-center">
              <span className="font-mono text-[10px] text-wm-text-muted">
                No participants yet
              </span>
            </div>
          )}
        </aside>
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-center gap-3 border-t border-wm-border bg-wm-bg px-6 py-4">
        <button
          type="button"
          onClick={() => setMuted((v) => !v)}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className={cn(
            'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors',
            muted
              ? 'bg-wm-error text-white'
              : 'bg-wm-surface text-wm-text-primary hover:bg-wm-surface-hover',
          )}
        >
          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setCameraOff((v) => !v)}
          aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
          className={cn(
            'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors',
            cameraOff
              ? 'bg-wm-error text-white'
              : 'bg-wm-surface text-wm-text-primary hover:bg-wm-surface-hover',
          )}
        >
          {cameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
        </button>
        <button
          type="button"
          aria-label="Share screen"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
        >
          <Monitor className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="More"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave call"
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full bg-wm-error px-4 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-white transition-colors hover:bg-wm-error/85"
        >
          <PhoneOff className="h-4 w-4" />
          Leave
        </button>
      </div>
    </div>
  )
}

const PALETTE = ['#A78BFA', '#F59E0B', '#3B82F6', '#EC4899', '#22D3EE']
function rotatingColor(i: number): string {
  return PALETTE[i % PALETTE.length]
}
