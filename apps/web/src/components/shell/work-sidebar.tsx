'use client'

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderKanban,
  Inbox,
  Sun,
} from 'lucide-react'
import {
  SidebarShell,
  SidebarSection,
  SidebarNavItem,
  SidebarComposeButton,
} from './sidebar-shell'
import { useProjects, useToday, type TaskStatus } from '@/lib/work-queries'

export interface WorkSidebarProps {
  user: { name: string; email: string }
  onNewProject?: () => void
  onUserMenu?: () => void
}

/**
 * Pencil reference: `WorkV3` left panel (`QAyVs`).
 *
 * - "+ NEW LIST" CTA at the top
 * - Tasks section: My day, Upcoming, Inbox, Overdue, Done (counts come
 *   from `useToday()`)
 * - Projects section: live list from `useProjects()` with the current
 *   project highlighted
 * - Docs link at the bottom
 */
export function WorkSidebar({ onNewProject }: WorkSidebarProps) {
  const pathname = usePathname()
  const is = (h: string) => pathname === h || pathname.startsWith(h + '/')
  const today = useToday()
  const projects = useProjects()

  // Today's tasks back the My day / Overdue / Done counters. We
  // categorise locally because /today doesn't bucket by status itself.
  const counters = useMemo(() => {
    const tasks = today.data?.tasks ?? []
    const out: Record<TaskStatus, number> & { overdue: number } = {
      todo: 0,
      in_progress: 0,
      done: 0,
      overdue: 0,
    }
    const now = Date.now()
    for (const t of tasks) {
      out[t.status] += 1
      if (t.dueDate && t.status !== 'done' && new Date(t.dueDate).getTime() < now) {
        out.overdue += 1
      }
    }
    return out
  }, [today.data])

  return (
    <SidebarShell
      cta={<SidebarComposeButton onClick={onNewProject}>New project</SidebarComposeButton>}
    >
      <SidebarSection label="Tasks">
        <SidebarNavItem
          href="/work"
          icon={<Sun className="h-[18px] w-[18px]" />}
          label="My day"
          active={pathname === '/work'}
          count={counters.todo + counters.in_progress}
        />
        <SidebarNavItem
          href="/work/upcoming"
          icon={<CalendarClock className="h-[18px] w-[18px]" />}
          label="Upcoming"
          active={is('/work/upcoming')}
        />
        <SidebarNavItem
          href="/work/inbox"
          icon={<Inbox className="h-[18px] w-[18px]" />}
          label="Inbox"
          active={is('/work/inbox')}
        />
        <SidebarNavItem
          href="/work/overdue"
          icon={<AlertTriangle className="h-[18px] w-[18px]" />}
          label="Overdue"
          active={is('/work/overdue')}
          count={counters.overdue || undefined}
        />
        <SidebarNavItem
          href="/work/done"
          icon={<CheckCircle2 className="h-[18px] w-[18px]" />}
          label="Done"
          active={is('/work/done')}
          count={counters.done || undefined}
        />
      </SidebarSection>

      <SidebarSection label="Projects">
        {projects.isPending ? (
          <p className="px-3 py-2 font-mono text-[11px] text-wm-text-muted">Loading…</p>
        ) : (projects.data ?? []).length === 0 ? (
          <p className="px-3 py-2 font-mono text-[11px] text-wm-text-muted">No projects yet</p>
        ) : (
          (projects.data ?? []).map((p) => (
            <SidebarNavItem
              key={p.id}
              href={`/work/projects/${p.id}`}
              icon={<FolderKanban className="h-[18px] w-[18px]" />}
              label={p.name}
              active={pathname === `/work/projects/${p.id}`}
            />
          ))
        )}
      </SidebarSection>

      <SidebarSection label="Docs">
        <SidebarNavItem
          href="/docs"
          icon={<FileText className="h-[18px] w-[18px]" />}
          label="All docs"
          active={pathname.startsWith('/docs')}
        />
      </SidebarSection>
    </SidebarShell>
  )
}
