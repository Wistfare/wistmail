import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from './search-bar'

describe('SearchBar', () => {
  it('renders with placeholder', () => {
    render(<SearchBar value="" onChange={() => {}} placeholder="Search emails..." />)
    expect(screen.getByPlaceholderText('Search emails...')).toBeInTheDocument()
  })

  it('calls onChange on input', () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } })
    expect(onChange).toHaveBeenCalledWith('test')
  })

  it('shows clear button when value present', () => {
    render(<SearchBar value="query" onChange={() => {}} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('clears value on clear click', () => {
    const onChange = vi.fn()
    render(<SearchBar value="query" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('shows shortcut hint when empty', () => {
    render(<SearchBar value="" onChange={() => {}} shortcutHint="/" />)
    expect(screen.getByText('/')).toBeInTheDocument()
  })

  it('hides shortcut hint when value present', () => {
    render(<SearchBar value="query" onChange={() => {}} shortcutHint="/" />)
    expect(screen.queryByText('/')).not.toBeInTheDocument()
  })

  it('calls onSubmit on Enter', () => {
    const onSubmit = vi.fn()
    render(<SearchBar value="query" onChange={() => {}} onSubmit={onSubmit} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
