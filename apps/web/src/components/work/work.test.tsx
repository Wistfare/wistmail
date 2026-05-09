import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { KanbanBoard, TaskCard, TaskRow, statusLabel } from './index'
import type { ProjectTask } from '@/lib/work-queries'

function buildTask(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 't_1',
    projectId: 'p_1',
    title: 'Build kanban variants',
    status: 'todo',
    assigneeId: null,
    dueDate: null,
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    ...overrides,
  }
}

function withQueryClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('TaskCard', () => {
  it('renders title and project chip', () => {
    render(<TaskCard task={buildTask()} projectName="Wistmail v2" />)
    expect(screen.getByText('Build kanban variants')).toBeInTheDocument()
    expect(screen.getByText('Wistmail v2')).toBeInTheDocument()
  })

  it('fires onClick', () => {
    const onClick = vi.fn()
    render(<TaskCard task={buildTask()} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('TaskRow', () => {
  it('toggles done via checkbox', () => {
    const onToggle = vi.fn()
    render(<TaskRow task={buildTask()} onToggleDone={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows highlighted state', () => {
    const { container } = render(<TaskRow task={buildTask()} highlighted />)
    expect((container.firstChild as HTMLElement).className).toMatch(/bg-wm-accent-dim/)
  })

  it('renders strike-through when done', () => {
    render(<TaskRow task={buildTask({ status: 'done' })} />)
    const title = screen.getByText('Build kanban variants')
    expect(title.className).toMatch(/line-through/)
  })
})

describe('statusLabel', () => {
  it('formats every status', () => {
    expect(statusLabel('todo')).toBe('Todo')
    expect(statusLabel('in_progress')).toBe('In progress')
    expect(statusLabel('done')).toBe('Done')
  })
})

describe('KanbanBoard', () => {
  const tasks: ProjectTask[] = [
    buildTask({ id: 't1', title: 'Backlog item', status: 'todo' }),
    buildTask({ id: 't2', title: 'Doing now', status: 'in_progress' }),
    buildTask({ id: 't3', title: 'Shipped', status: 'done' }),
  ]

  it('renders 3 columns + tasks per column', () => {
    render(withQueryClient(<KanbanBoard tasks={tasks} />))
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    // "In progress" appears as both column header AND a card status hint;
    // assert at-least-1 rather than exact-1.
    expect(screen.getAllByText('In progress').length).toBeGreaterThanOrEqual(1)
    // "Done" likewise.
    expect(screen.getAllByText('Done').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Backlog item')).toBeInTheDocument()
    expect(screen.getByText('Doing now')).toBeInTheDocument()
    expect(screen.getByText('Shipped')).toBeInTheDocument()
  })

  it('fires onTaskClick when a card is clicked', () => {
    const onTaskClick = vi.fn()
    render(withQueryClient(<KanbanBoard tasks={tasks} onTaskClick={onTaskClick} />))
    fireEvent.click(screen.getByText('Doing now'))
    expect(onTaskClick).toHaveBeenCalledOnce()
    expect(onTaskClick.mock.calls[0][0].id).toBe('t2')
  })

  it('fires onAddTask when "+" header button is clicked', () => {
    const onAddTask = vi.fn()
    render(withQueryClient(<KanbanBoard tasks={tasks} onAddTask={onAddTask} />))
    fireEvent.click(screen.getByLabelText('Add task to Backlog'))
    expect(onAddTask).toHaveBeenCalledWith('todo')
  })

  it('shows "Drop a task here" placeholder for empty column', () => {
    render(withQueryClient(<KanbanBoard tasks={[]} />))
    expect(screen.getAllByText('Drop a task here').length).toBe(3)
  })
})
