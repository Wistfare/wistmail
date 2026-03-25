import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Badge } from './badge'
import { Avatar } from './avatar'
import { LabelDot } from './label-dot'
import { StatCard } from './stat-card'
import { SettingsCard } from './settings-card'
import { Toggle } from './toggle'

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>New</Badge>)
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('applies variant styles', () => {
    const { container } = render(<Badge variant="accent">Active</Badge>)
    expect(container.firstChild).toHaveClass('text-wm-accent')
  })

  it('accepts className', () => {
    const { container } = render(<Badge className="custom">Test</Badge>)
    expect(container.firstChild).toHaveClass('custom')
  })
})

describe('Avatar', () => {
  it('shows initials when no src', () => {
    render(<Avatar name="Alex Johnson" />)
    expect(screen.getByText('AJ')).toBeInTheDocument()
  })

  it('renders image when src provided', () => {
    render(<Avatar name="Alex" src="/avatar.jpg" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/avatar.jpg')
  })

  it('applies size classes', () => {
    const { container } = render(<Avatar name="Alex" size="lg" />)
    expect(container.firstChild).toHaveClass('h-10')
  })

  it('generates consistent background color', () => {
    const { container: c1 } = render(<Avatar name="Test User" />)
    const { container: c2 } = render(<Avatar name="Test User" />)
    const style1 = (c1.firstChild as HTMLElement).style.backgroundColor
    const style2 = (c2.firstChild as HTMLElement).style.backgroundColor
    expect(style1).toBe(style2)
  })
})

describe('LabelDot', () => {
  it('renders with color', () => {
    const { container } = render(<LabelDot color="#FF0000" />)
    const dot = container.querySelector('span')
    expect(dot?.style.backgroundColor).toBe('rgb(255, 0, 0)')
  })

  it('shows label text', () => {
    render(<LabelDot color="#00FF00" label="Primary" />)
    expect(screen.getByText('Primary')).toBeInTheDocument()
  })
})

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="EMAILS SENT" value="14,293" />)
    expect(screen.getByText('EMAILS SENT')).toBeInTheDocument()
    expect(screen.getByText('14,293')).toBeInTheDocument()
  })

  it('shows change indicator', () => {
    render(<StatCard title="Rate" value="99%" change="+5%" changeType="positive" />)
    expect(screen.getByText('+5%')).toBeInTheDocument()
    expect(screen.getByText('+5%')).toHaveClass('text-wm-accent')
  })

  it('shows negative change in error color', () => {
    render(<StatCard title="Bounce" value="2%" change="+0.5%" changeType="negative" />)
    expect(screen.getByText('+0.5%')).toHaveClass('text-wm-error')
  })
})

describe('SettingsCard', () => {
  it('renders title and children', () => {
    render(
      <SettingsCard title="Account">
        <p>Content here</p>
      </SettingsCard>,
    )
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Content here')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(
      <SettingsCard title="AI" description="Configure AI provider">
        <div />
      </SettingsCard>,
    )
    expect(screen.getByText('Configure AI provider')).toBeInTheDocument()
  })
})

describe('Toggle', () => {
  it('renders as switch', () => {
    render(<Toggle checked={false} onChange={() => {}} />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('reflects checked state', () => {
    render(<Toggle checked={true} onChange={() => {}} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onChange on click', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('disables when disabled prop is true', () => {
    render(<Toggle checked={false} onChange={() => {}} disabled />)
    expect(screen.getByRole('switch')).toBeDisabled()
  })
})
