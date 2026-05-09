'use client'

import { useEffect, useState } from 'react'
import {
  Calendar,
  Check,
  ChevronRight,
  Flag,
  GitCommitHorizontal,
  Link as LinkIcon,
  MoreHorizontal,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import {
  useUpdateTask,
  type ProjectTask,
  type TaskStatus,
} from '@/lib/work-queries'
import { cn, getInitials, stringToColor } from '@/lib/utils'

export interface TaskDrawerProps {
  open: boolean
  onClose: () => void
  task: ProjectTask | null
  projectName?: string
  projectColor?: string
  projectId: string
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'TODO',
  in_progress: 'IN PROGRESS',
  done: 'DONE',
}

/**
 * Right-edge task drawer — Pencil reference: `taskDrawer` (`Mxst9`).
 *
 *   container: 480 wide, full height, bg #111111, 1px LEFT #1A1A1A,
 *     drop-shadow blur 48 #000000B0 offset x=-12
 *   dHd (`WusAB`, padding [16,24], 1px bottom #1A1A1A, justify between):
 *     dHdL (gap 10): breadcrumb chips
 *       "PROJECT NAME" 9/700 #6e6e6e tracking 1.5
 *       "/" 10/600 #404040
 *       "TYPE" 9/700 lime tracking 1.5
 *       "#WM-127" 9/700 #6e6e6e tracking 1.5
 *     dHdR (gap 6): two 32×32 round-square (radius 8) #000000 buttons
 *       (link · ellipsis @ 13 #999999)
 *   dBody (`R68Lo`, padding [20,24], gap 18, vertical):
 *     title 22/700 white lineHeight 1.3
 *     sRow (gap 8): status / priority / due-date pills (radius 14)
 *     metaSec: ASSIGNEE row + REVIEWERS row
 *     descSec: "DESCRIPTION" 9/700 #6e6e6e + Inter 13 #999999 lh 1.6
 *     subSec: "SUBTASKS · 7 / 10" + "+ ADD" + checkbox rows
 *     actSec: "ACTIVITY" + comment items
 *   composer (`A3kAax`, padding [12,20,16,20], 1px top, gap 10):
 *     cmpBox 36 high radius 18 padding [0,12] gap 8 1px #1A1A1A border
 *     36×36 lime Send button (radius 18, send icon 13 black)
 */
export function TaskDrawer({
  open,
  onClose,
  task,
  projectName,
  projectColor = '#BFFF00',
  projectId,
}: TaskDrawerProps) {
  const update = useUpdateTask(projectId)
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setStatus(task.status)
    }
  }, [task])

  // Close on Esc — keeps the overlay UX consistent across drawers.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function commitTitle() {
    if (!task) return
    if (title.trim() === task.title || !title.trim()) return
    await update.mutateAsync({ id: task.id, title: title.trim() })
  }

  async function changeStatus(next: TaskStatus) {
    if (!task) return
    setStatus(next)
    await update.mutateAsync({ id: task.id, status: next })
  }

  // Pre-task placeholder — the slide-in still renders so we can show
  // the same chrome and let "Esc"/click-outside dismiss.
  if (!task) {
    return (
      <Overlay onClose={onClose}>
        <Header projectName={projectName} projectColor={projectColor} taskId={null} />
        <div className="flex flex-1 items-center justify-center" style={{ padding: 24 }}>
          <p className="font-mono" style={{ fontSize: 12, color: '#6e6e6e' }}>
            Select a task to view its details.
          </p>
        </div>
      </Overlay>
    )
  }

  return (
    <Overlay onClose={onClose}>
      <Header
        projectName={projectName}
        projectColor={projectColor}
        taskId={task.id}
      />

      {/* dBody */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '20px 24px' }}
      >
        <div className="flex flex-col" style={{ gap: 18 }}>
          {/* Title — inline-editable. Commit on blur or Enter. */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className="bg-transparent font-mono font-bold text-wm-text-primary outline-none placeholder:text-wm-text-muted focus:underline focus:underline-offset-4"
            style={{ fontSize: 22, lineHeight: 1.3 }}
            placeholder="Untitled task"
          />

          {/* sRow: status + priority + due-date pills */}
          <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
            <StatusPill status={status} onChange={changeStatus} />
            <PriorityPill task={task} />
            <DuePill due={task.dueDate} />
          </div>

          {/* metaSec — ASSIGNEE / REVIEWERS */}
          <div className="flex flex-col" style={{ gap: 10 }}>
            <MetaRow
              label="Assignee"
              value={
                task.assigneeId ? (
                  <AvatarChip name="Assignee" />
                ) : (
                  <span
                    className="font-mono"
                    style={{ fontSize: 12, color: '#6e6e6e' }}
                  >
                    Unassigned
                  </span>
                )
              }
            />
          </div>

          {/* descSec */}
          <Section label="Description">
            <p
              className="font-sans"
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: '#999999',
              }}
            >
              {/* Description isn't yet stored on ProjectTask in the API —
                  Pencil shows a placeholder paragraph, and we mirror that
                  intent here until the field lands. */}
              No description yet. Add notes, links, or context for this
              task to keep everyone aligned.
            </p>
          </Section>

          {/* subSec — Pencil shows 5 subtask rows.  We don't yet have
              subtasks server-side; render an empty-state header so the
              section visibly exists without faking data. */}
          <Section
            label="Subtasks · 0"
            rightAction="+ ADD"
            actionDisabled
          >
            <p
              className="font-mono"
              style={{ fontSize: 11, color: '#6e6e6e' }}
            >
              Break this task down into smaller steps.
            </p>
          </Section>

          {/* actSec — placeholder timeline; comments + git events land
              behind a future `useTaskActivity(task.id)` query. */}
          <Section label="Activity">
            <ActivityItem
              avatar={<GitCommitHorizontal style={{ width: 11, height: 11, color: '#6e6e6e' }} />}
              avatarBg="#000000"
              avatarBorder="#1A1A1A"
              title="Created"
              subtitle={new Date(task.createdAt).toLocaleString()}
            />
          </Section>
        </div>
      </div>

      {/* composer */}
      <div
        className="flex w-full flex-col"
        style={{
          padding: '12px 20px 16px 20px',
          gap: 10,
          borderTop: '1px solid var(--color-wm-border)',
        }}
      >
        <div className="flex w-full items-center" style={{ gap: 10 }}>
          <div
            className="flex flex-1 items-center"
            style={{
              height: 36,
              padding: '0 12px',
              gap: 8,
              background: '#000000',
              borderRadius: 18,
              border: '1px solid var(--color-wm-border)',
            }}
          >
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-transparent font-mono outline-none placeholder:text-wm-text-muted"
              style={{ fontSize: 12, fontWeight: 500, color: '#FFFFFF' }}
            />
            <Sparkles
              style={{
                width: 12,
                height: 12,
                color: 'var(--color-wm-accent)',
              }}
            />
          </div>
          <button
            type="button"
            disabled={!comment.trim()}
            aria-label="Post comment"
            onClick={() => {
              // TODO(work-comments): POST /tasks/:id/comments once API exists.
              setComment('')
            }}
            className={cn(
              'flex items-center justify-center transition-colors',
              comment.trim()
                ? 'cursor-pointer bg-wm-accent hover:bg-wm-accent-hover'
                : 'cursor-not-allowed bg-wm-accent/40',
            )}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              color: '#000000',
            }}
          >
            <Send style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>
    </Overlay>
  )
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full flex-col"
        role="dialog"
        aria-label="Task details"
        style={{
          width: 480,
          background: '#111111',
          borderLeft: '1px solid var(--color-wm-border)',
          boxShadow: '-12px 0 48px 0 rgba(0,0,0,0.7)',
        }}
      >
        {children}
      </aside>
    </>
  )
}

function Header({
  projectName,
  projectColor,
  taskId,
}: {
  projectName?: string
  projectColor?: string
  taskId: string | null
}) {
  return (
    <header
      className="flex w-full items-center justify-between"
      style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--color-wm-border)',
      }}
    >
      <div className="flex min-w-0 items-center" style={{ gap: 10 }}>
        {projectName && (
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
          >
            {projectName}
          </span>
        )}
        <span
          className="font-mono font-semibold"
          style={{ fontSize: 10, color: '#404040' }}
        >
          /
        </span>
        <span
          className="font-mono font-bold uppercase"
          style={{
            fontSize: 9,
            letterSpacing: 1.5,
            color: projectColor || 'var(--color-wm-accent)',
          }}
        >
          Task
        </span>
        {taskId && (
          <span
            className="font-mono font-bold uppercase"
            style={{
              fontSize: 9,
              letterSpacing: 1.5,
              color: '#6e6e6e',
            }}
          >
            #{taskId.slice(0, 6)}
          </span>
        )}
      </div>
      <div className="flex items-center" style={{ gap: 6 }}>
        <HeaderIc label="Copy link">
          <LinkIcon style={{ width: 13, height: 13 }} />
        </HeaderIc>
        <HeaderIc label="More">
          <MoreHorizontal style={{ width: 13, height: 13 }} />
        </HeaderIc>
      </div>
    </header>
  )
}

function HeaderIc({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex cursor-pointer items-center justify-center text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: '#000000',
      }}
    >
      {children}
    </button>
  )
}

function StatusPill({
  status,
  onChange,
}: {
  status: TaskStatus
  onChange: (next: TaskStatus) => void
}) {
  // Pencil "IN PROGRESS" pill — radius 14, padding [5,10], gap 6,
  // bg #1A2200, 1px lime border, 6×6 lime dot + 10/700 lime tracking 1.5.
  // We treat all 3 states with the same shape but different palette.
  const palette: Record<TaskStatus, { bg: string; fg: string; border: string }> = {
    todo: { bg: '#111111', fg: '#999999', border: 'var(--color-wm-border)' },
    in_progress: {
      bg: 'var(--color-wm-accent-dim)',
      fg: 'var(--color-wm-accent)',
      border: 'var(--color-wm-accent)',
    },
    done: { bg: '#0A2A0A', fg: '#3DB874', border: '#3DB874' },
  }
  const order: TaskStatus[] = ['todo', 'in_progress', 'done']
  const next = order[(order.indexOf(status) + 1) % order.length]
  const p = palette[status]
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      title={`Mark as ${STATUS_LABEL[next]}`}
      className="inline-flex cursor-pointer items-center font-mono font-bold uppercase transition-colors hover:opacity-90"
      style={{
        gap: 6,
        padding: '5px 10px',
        fontSize: 10,
        letterSpacing: 1.5,
        borderRadius: 14,
        background: p.bg,
        color: p.fg,
        border: `1px solid ${p.border}`,
      }}
    >
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: 999, background: p.fg }}
      />
      {STATUS_LABEL[status]}
    </button>
  )
}

function PriorityPill({ task: _ }: { task: ProjectTask }) {
  // Pencil shows "P0" with bg #3A2A0A, amber flag + amber text. Until we
  // store a priority on tasks server-side this is a static affordance —
  // we surface "P-" so the chip is visibly inert rather than asserting
  // a fake priority.
  return (
    <span
      className="inline-flex items-center font-mono font-bold"
      style={{
        gap: 6,
        padding: '5px 10px',
        fontSize: 10,
        borderRadius: 14,
        background: '#1A1A1A',
        color: '#6e6e6e',
      }}
    >
      <Flag style={{ width: 11, height: 11 }} />
      P—
    </span>
  )
}

function DuePill({ due }: { due: string | null }) {
  if (!due) return null
  const d = new Date(due)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isToday = d >= today && d < tomorrow
  const label = isToday
    ? 'DUE TODAY'
    : `DUE ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}`
  return (
    <span
      className="inline-flex items-center font-mono font-bold uppercase text-wm-text-primary"
      style={{
        gap: 6,
        padding: '5px 10px',
        fontSize: 10,
        letterSpacing: 1,
        borderRadius: 14,
        background: '#000000',
        border: '1px solid var(--color-wm-border)',
      }}
    >
      <Calendar style={{ width: 11, height: 11, color: '#999999' }} />
      {label}
    </span>
  )
}

function MetaRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-col" style={{ gap: 8 }}>
      <span
        className="font-mono font-bold uppercase"
        style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
      >
        {label}
      </span>
      <div className="flex items-center" style={{ gap: 8 }}>
        {value}
      </div>
    </div>
  )
}

function AvatarChip({ name }: { name: string }) {
  const init = getInitials(name)
  const bg = stringToColor(name)
  return (
    <span className="flex items-center" style={{ gap: 8 }}>
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full font-mono font-bold text-white"
        style={{
          width: 24,
          height: 24,
          fontSize: 9,
          backgroundColor: bg,
        }}
      >
        {init || '?'}
      </span>
      <span
        className="font-mono font-semibold text-wm-text-primary"
        style={{ fontSize: 13 }}
      >
        {name}
      </span>
    </span>
  )
}

function Section({
  label,
  rightAction,
  actionDisabled,
  children,
}: {
  label: string
  rightAction?: string
  actionDisabled?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="flex w-full flex-col" style={{ gap: 8 }}>
      <header className="flex w-full items-center justify-between">
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
        >
          {label}
        </span>
        {rightAction && (
          <span
            className={cn(
              'font-mono font-bold uppercase',
              actionDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer text-wm-accent',
            )}
            style={{ fontSize: 9, letterSpacing: 1, color: actionDisabled ? '#404040' : undefined }}
          >
            {rightAction}
          </span>
        )}
      </header>
      {children}
    </section>
  )
}

function ActivityItem({
  avatar,
  avatarBg,
  avatarBorder,
  title,
  subtitle,
}: {
  avatar: React.ReactNode
  avatarBg: string
  avatarBorder?: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex w-full items-center" style={{ gap: 10 }}>
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full"
        style={{
          width: 24,
          height: 24,
          background: avatarBg,
          border: avatarBorder ? `1px solid ${avatarBorder}` : 'none',
        }}
      >
        {avatar}
      </span>
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
        <span
          className="font-mono font-semibold text-wm-text-primary"
          style={{ fontSize: 11 }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            className="font-mono"
            style={{ fontSize: 10, color: '#6e6e6e' }}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )
}

// Re-exported icon helpers — kept for forward compat with subtask
// rendering once that data lands.
export function SubtaskCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center"
      style={{ gap: 10, padding: '6px 0' }}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          background: checked ? 'var(--color-wm-accent)' : 'transparent',
          border: checked ? 'none' : '1.5px solid #6e6e6e',
        }}
      >
        {checked && (
          <Check
            style={{ width: 11, height: 11, color: '#000000' }}
            strokeWidth={3}
          />
        )}
      </span>
      <span
        className="flex-1 truncate font-mono"
        style={{
          fontSize: 12,
          fontWeight: checked ? 500 : 600,
          color: checked ? '#6e6e6e' : '#FFFFFF',
          textDecoration: checked ? 'line-through' : 'none',
        }}
      >
        {label}
      </span>
    </button>
  )
}

// Re-export X for callers that want to render their own dismiss control
// inside the drawer body (e.g. inline edit cancel). The Pencil header
// doesn't include an X — Esc / overlay-click close instead.
export { ChevronRight, X }
