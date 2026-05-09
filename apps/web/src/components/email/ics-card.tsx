'use client'

import { CalendarPlus, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ICSCardProps {
  title: string
  /** Pre-formatted timing (e.g. "Wed, Apr 23 · 14:00 – 15:00"). */
  when: string
  location?: string
  organizer?: string
  rsvp?: 'pending' | 'accepted' | 'declined' | 'tentative'
  onAccept?: () => void
  onDecline?: () => void
  onTentative?: () => void
  className?: string
}

/**
 * Calendar-invite (.ics) card rendered inside an email body.
 * Pencil reference: `Web/ICSCard` (`RVYzn`).
 */
export function ICSCard({
  title,
  when,
  location,
  organizer,
  rsvp = 'pending',
  onAccept,
  onDecline,
  onTentative,
  className,
}: ICSCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-wm-border bg-wm-surface p-4',
        rsvp === 'accepted' && 'border-wm-accent/40',
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wm-accent-dim text-wm-accent">
          <CalendarPlus className="h-5 w-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h4 className="truncate font-sans text-sm font-semibold text-wm-text-primary">
            {title}
          </h4>
          <p className="truncate font-mono text-[11px] text-wm-text-secondary">{when}</p>
          {location && (
            <p className="truncate font-mono text-[11px] text-wm-text-tertiary">{location}</p>
          )}
        </div>
      </header>
      {organizer && (
        <p className="font-mono text-[11px] text-wm-text-tertiary">
          From <span className="text-wm-text-secondary">{organizer}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <RsvpButton
          variant="primary"
          icon={<Check className="h-3.5 w-3.5" />}
          active={rsvp === 'accepted'}
          onClick={onAccept}
        >
          Accept
        </RsvpButton>
        <RsvpButton
          variant="ghost"
          active={rsvp === 'tentative'}
          onClick={onTentative}
        >
          Tentative
        </RsvpButton>
        <RsvpButton
          variant="ghost"
          icon={<X className="h-3.5 w-3.5" />}
          active={rsvp === 'declined'}
          onClick={onDecline}
        >
          Decline
        </RsvpButton>
      </div>
    </div>
  )
}

function RsvpButton({
  variant,
  active,
  icon,
  children,
  onClick,
}: {
  variant: 'primary' | 'ghost'
  active?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[1px] transition-colors',
        variant === 'primary'
          ? active
            ? 'bg-wm-accent text-wm-text-on-accent'
            : 'border border-wm-accent/40 text-wm-accent hover:bg-wm-accent/10'
          : active
            ? 'bg-wm-surface-hover text-wm-text-primary'
            : 'border border-wm-border text-wm-text-secondary hover:bg-wm-surface-hover',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
