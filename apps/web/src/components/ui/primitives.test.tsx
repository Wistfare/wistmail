import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  Card,
  Drawer,
  EmptyState,
  FieldStack,
  IconButton,
  Kbd,
  Menu,
  Modal,
  Skeleton,
  Tabs,
  Tooltip,
} from './index'

describe('IconButton', () => {
  it('renders with required aria-label', () => {
    render(<IconButton aria-label="Reply">i</IconButton>)
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument()
  })

  it('fires onClick', () => {
    const onClick = vi.fn()
    render(<IconButton aria-label="x" onClick={onClick}>x</IconButton>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies active state on non-accent variant', () => {
    render(<IconButton aria-label="x" active>x</IconButton>)
    expect(screen.getByRole('button').className).toContain('bg-wm-surface-hover')
  })
})

describe('Kbd', () => {
  it('renders shortcut chip', () => {
    render(<Kbd>K</Kbd>)
    expect(screen.getByText('K').tagName).toBe('KBD')
  })
})

describe('Tooltip', () => {
  it('shows content on hover', () => {
    render(
      <Tooltip content="Hello">
        <button>trigger</button>
      </Tooltip>,
    )
    fireEvent.mouseEnter(screen.getByText('trigger'))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hello')
  })

  it('hides content on mouse leave', () => {
    render(
      <Tooltip content="Hello">
        <button>trigger</button>
      </Tooltip>,
    )
    const t = screen.getByText('trigger')
    fireEvent.mouseEnter(t)
    fireEvent.mouseLeave(t)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('Menu', () => {
  function Harness({ onPick }: { onPick: () => void }) {
    return (
      <Menu>
        <Menu.Trigger>open</Menu.Trigger>
        <Menu.Items>
          <Menu.Item onClick={onPick}>Reply</Menu.Item>
          <Menu.Separator />
          <Menu.Item destructive>Delete</Menu.Item>
        </Menu.Items>
      </Menu>
    )
  }

  it('opens on trigger click and closes on item click', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    fireEvent.click(screen.getByText('open'))
    const reply = screen.getByText('Reply')
    expect(reply).toBeInTheDocument()
    fireEvent.click(reply)
    expect(onPick).toHaveBeenCalledOnce()
    expect(screen.queryByText('Reply')).toBeNull()
  })

  it('closes on Escape', () => {
    render(<Harness onPick={() => {}} />)
    fireEvent.click(screen.getByText('open'))
    expect(screen.getByText('Reply')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Reply')).toBeNull()
  })
})

describe('Modal', () => {
  it('renders when open', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Hi" description="d">
        <p>body</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Hi')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hi">
        <p>body</p>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(
      <Modal open={true} onClose={onClose} title="Hi">
        <p>body</p>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('Drawer', () => {
  it('renders title and content when open', () => {
    render(
      <Drawer open={true} onClose={() => {}} title="Task">
        <p>contents</p>
      </Drawer>,
    )
    expect(screen.getByText('Task')).toBeInTheDocument()
    expect(screen.getByText('contents')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <Drawer open={false} onClose={() => {}} title="Task">
        <p>x</p>
      </Drawer>,
    )
    expect(screen.queryByText('Task')).toBeNull()
  })
})

describe('Tabs', () => {
  function Harness() {
    const [v, setV] = useState('a')
    return (
      <Tabs value={v} onChange={setV}>
        <Tabs.Tab value="a" count={3}>A</Tabs.Tab>
        <Tabs.Tab value="b">B</Tabs.Tab>
      </Tabs>
    )
  }

  it('renders and switches active tab', () => {
    render(<Harness />)
    const a = screen.getByRole('tab', { name: /A/ })
    const b = screen.getByRole('tab', { name: 'B' })
    expect(a).toHaveAttribute('aria-selected', 'true')
    expect(b).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(b)
    expect(b).toHaveAttribute('aria-selected', 'true')
  })

  it('shows count chip', () => {
    render(<Harness />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})

describe('Card', () => {
  it('renders children', () => {
    render(<Card>hello</Card>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
  it('uses nested bg when prop set', () => {
    const { container } = render(<Card nested>x</Card>)
    expect((container.firstChild as HTMLElement).className).toContain('bg-wm-bg')
  })
})

describe('EmptyState', () => {
  it('renders title, description, action', () => {
    render(
      <EmptyState
        title="Empty"
        description="No items"
        action={<button>Reload</button>}
      />,
    )
    expect(screen.getByText('Empty')).toBeInTheDocument()
    expect(screen.getByText('No items')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})

describe('Skeleton', () => {
  it('renders single block', () => {
    render(<Skeleton />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
  it('renders multiple rows', () => {
    render(<Skeleton rows={4} />)
    expect(screen.getAllByRole('status')).toHaveLength(4)
  })
})

describe('FieldStack', () => {
  it('renders label and required marker', () => {
    render(
      <FieldStack label="Email" required htmlFor="e">
        <input id="e" />
      </FieldStack>,
    )
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('shows error over hint', () => {
    render(
      <FieldStack label="x" hint="hint text" error="error text">
        <input />
      </FieldStack>,
    )
    expect(screen.getByText('error text')).toBeInTheDocument()
    expect(screen.queryByText('hint text')).toBeNull()
  })
})
