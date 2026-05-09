'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shell'
import { FilterPills } from '@/components/email/filter-pills'
import { MeetingListItem, MeetingHeroCard } from '@/components/meetings'
import { useFilteredMeetings, type MeetingFilter } from '@/lib/meeting-queries'
import { Button, EmptyState } from '@/components/ui'
import { Plus } from 'lucide-react'

/**
 * `/meetings` — Pencil reference: `MeetingsV3` (`RTarH`).
 *
 * Two-column layout: left list of meetings (filtered by Upcoming /
 * Recent / All), right hero card with the selected meeting's details
 * and a JOIN MEETING CTA.
 */
export default function MeetingsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<MeetingFilter>('upcoming')
  const meetings = useFilteredMeetings(filter)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const list = meetings.data ?? []
  const selected = list.find((m) => m.id === selectedId) ?? list[0] ?? null

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Calendar"
        title="Meetings"
        subtitle={list.length > 0 ? `${list.length} ${filter}` : undefined}
        actions={
          <Button
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => router.push('/calendar?compose=1')}
          >
            New meeting
          </Button>
        }
        toolbar={
          <FilterPills<MeetingFilter>
            value={filter}
            options={[
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'recent', label: 'Recent' },
              { id: 'all', label: 'All' },
            ]}
            onChange={setFilter}
          />
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-r border-wm-border">
          {meetings.isPending ? (
            <div className="flex items-center justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              title={
                filter === 'upcoming'
                  ? 'No upcoming meetings'
                  : filter === 'recent'
                    ? 'No recent meetings'
                    : 'No meetings yet'
              }
              description="Schedule one from Calendar."
              action={
                <Button
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => router.push('/calendar?compose=1')}
                >
                  New meeting
                </Button>
              }
            />
          ) : (
            list.map((m) => (
              <MeetingListItem
                key={m.id}
                href={`/meetings/${m.id}`}
                meeting={m}
                active={selected?.id === m.id}
              />
            ))
          )}
        </aside>

        <main className="flex-1 overflow-y-auto">
          <MeetingHeroCard
            meeting={selected}
            onJoin={(m) => {
              if (m.meetingLink) {
                // Open the external meeting URL in a new tab. The
                // /meetings/[id] route hosts the in-call placeholder UI.
                window.open(m.meetingLink, '_blank', 'noopener,noreferrer')
                router.push(`/meetings/${m.id}`)
              }
            }}
          />
        </main>
      </div>

      {/* Side-effect: pre-select the first meeting once the list loads. */}
      <SelectFirst list={list} onPick={setSelectedId} selectedId={selectedId} />
    </div>
  )
}

/**
 * Tiny helper that snaps `selectedId` to the first available meeting
 * once the list resolves. Kept as its own component so we don't sprinkle
 * useEffects through the parent.
 */
function SelectFirst({
  list,
  selectedId,
  onPick,
}: {
  list: { id: string }[]
  selectedId: string | null
  onPick: (id: string) => void
}) {
  if (selectedId) return null
  if (list.length === 0) return null
  // We can't call setState during render — defer to a microtask.
  queueMicrotask(() => onPick(list[0].id))
  return null
}
