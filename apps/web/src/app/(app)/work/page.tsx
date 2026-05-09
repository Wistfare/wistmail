'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Plus, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import { Button, EmptyState } from '@/components/ui'
import { QuickTaskFab, TaskRow, TodayFlowPanel } from '@/components/work'
import { useProjects, useToday } from '@/lib/work-queries'
import { rangeForWeek, useEventsInRange } from '@/lib/event-queries'

/**
 * `/work` — Pencil reference: `WorkV3` (`QAyVs`).
 *
 * Three-column layout when `Today's flow` data is available:
 *   [list pane] [main task feed] [TodayFlowPanel right rail]
 * The list pane is the AppShell's `WorkSidebar` (rendered outside this
 * file). This page hosts the centre + right rail + the QuickTaskFab.
 */
export default function WorkPage() {
  const today = useToday()
  const projects = useProjects()
  const tasks = today.data?.tasks ?? []
  const next = tasks[0]
  const rest = tasks.slice(1)

  // Today's events feed the right rail's "Meetings" list.
  const range = useMemo(() => rangeForWeek(new Date()), [])
  const events = useEventsInRange(range.from, range.to)
  const meetings = useMemo(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const tomorrow = new Date(startOfDay)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return (events.data ?? [])
      .filter((e) => {
        const at = new Date(e.startAt)
        return at >= startOfDay && at < tomorrow
      })
      .map((e) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startAt,
        endsAt: e.endAt,
        meetingLink: e.meetingLink,
      }))
  }, [events.data])

  // "Focus" estimate = 8h - sum(meeting durations). Pencil shows
  // "2h 14m focus"; we mirror the format.
  const focusLabel = useMemo(() => {
    const meetingMinutes = meetings.reduce((acc, m) => {
      const start = new Date(m.startsAt).getTime()
      const end = m.endsAt ? new Date(m.endsAt).getTime() : start + 30 * 60_000
      return acc + Math.max(0, (end - start) / 60_000)
    }, 0)
    const total = Math.max(0, 8 * 60 - meetingMinutes)
    const h = Math.floor(total / 60)
    const m = Math.floor(total % 60)
    return `${h}h ${m}m focus`
  }, [meetings])

  // Default project for the QuickTaskFab — most recent project.
  const defaultProjectId = projects.data?.[0]?.id

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col">
        <PageHeader
          eyebrow="Work"
          title="My day"
          subtitle={today.data?.greeting}
          actions={
            <Link href="/work/projects">
              <Button variant="secondary">
                All projects
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          }
        />

        <div className="flex-1 overflow-y-auto">
          {today.isPending ? (
            <div className="flex h-full items-center justify-center">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
            </div>
          ) : tasks.length === 0 ? (
            <EmptyState
              title="Nothing on your plate today"
              description="Action items pulled from your projects + emails will land here."
              action={
                <Link href="/work/projects">
                  <Button>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Open projects
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col">
              <SectionDivider label="Up next" count={next ? 1 : 0} />
              {next && (
                <TaskRow
                  key={next.id}
                  task={{
                    id: next.id,
                    projectId: next.projectId,
                    title: next.title,
                    status: next.status,
                    assigneeId: null,
                    dueDate: next.dueDate,
                    createdAt: next.dueDate ?? new Date().toISOString(),
                    updatedAt: next.dueDate ?? new Date().toISOString(),
                  }}
                  projectName={next.projectName}
                  highlighted
                />
              )}
              {rest.length > 0 && (
                <>
                  <SectionDivider label="Later today" count={rest.length} />
                  {rest.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={{
                        id: t.id,
                        projectId: t.projectId,
                        title: t.title,
                        status: t.status,
                        assigneeId: null,
                        dueDate: t.dueDate,
                        createdAt: t.dueDate ?? new Date().toISOString(),
                        updatedAt: t.dueDate ?? new Date().toISOString(),
                      }}
                      projectName={t.projectName}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* V3 right rail — Pencil `WorkV3.todayFlow`. */}
      <TodayFlowPanel
        focusLabel={focusLabel}
        focusHint="Block of unbooked time today"
        meetings={meetings}
        onJoinMeeting={(m) => {
          if (m.meetingLink) {
            window.open(m.meetingLink, '_blank', 'noopener,noreferrer')
          }
        }}
        aiBrief={
          tasks.length === 0
            ? 'No tasks queued — add one from a project or via the Quick task pill.'
            : `${tasks.length} task${tasks.length === 1 ? '' : 's'} on deck. Highest priority is "${next?.title ?? '—'}".`
        }
      />

      {/* + Quick task FAB — bottom-left of the viewport. */}
      <QuickTaskFab defaultProjectId={defaultProjectId} />
    </div>
  )
}

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between border-b border-wm-border bg-wm-bg px-5 pb-2 pt-4">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
        {label}
      </span>
      <span className="font-mono text-[10px] text-wm-text-muted">{count}</span>
    </div>
  )
}
