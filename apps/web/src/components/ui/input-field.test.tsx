import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InputField } from './input-field'

describe('InputField', () => {
  it('renders with label', () => {
    render(<InputField label="Email" />)
    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('renders without label', () => {
    render(<InputField placeholder="Type here" />)
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument()
  })

  it('shows error message', () => {
    render(<InputField error="Required field" />)
    expect(screen.getByText('Required field')).toBeInTheDocument()
  })

  it('shows hint when no error', () => {
    render(<InputField hint="Enter your email" />)
    expect(screen.getByText('Enter your email')).toBeInTheDocument()
  })

  it('hides hint when error present', () => {
    render(<InputField hint="Enter your email" error="Invalid" />)
    expect(screen.queryByText('Enter your email')).not.toBeInTheDocument()
    expect(screen.getByText('Invalid')).toBeInTheDocument()
  })

  it('renders icon', () => {
    render(<InputField icon={<span data-testid="icon">@</span>} />)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('handles onChange', () => {
    const onChange = vi.fn()
    render(<InputField onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('applies error border style', () => {
    const { container } = render(<InputField error="Bad" />)
    const wrapper = container.querySelector('.border-wm-error')
    expect(wrapper).toBeInTheDocument()
  })
})
