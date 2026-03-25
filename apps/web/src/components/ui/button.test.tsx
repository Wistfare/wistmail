import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('fires onClick handler', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByText('Click'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders with icon', () => {
    render(<Button icon={<span data-testid="icon">+</span>}>Add</Button>)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('disables when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('disables when loading', () => {
    render(<Button loading>Loading</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows spinner when loading', () => {
    render(<Button loading>Loading</Button>)
    expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument()
  })

  it('applies variant classes', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>)
    expect(screen.getByRole('button').className).toContain('bg-wm-accent')

    rerender(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button').className).toContain('border-wm-border')

    rerender(<Button variant="danger">Danger</Button>)
    expect(screen.getByRole('button').className).toContain('text-wm-error')

    rerender(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button').className).toContain('text-wm-text-secondary')
  })

  it('merges className', () => {
    render(<Button className="custom-class">Test</Button>)
    expect(screen.getByRole('button').className).toContain('custom-class')
  })
})
