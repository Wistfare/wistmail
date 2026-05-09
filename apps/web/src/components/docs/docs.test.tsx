import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DocCard, DocCardEmpty, DocEditor } from './index'

describe('DocCard', () => {
  it('renders title, icon, preview, and relative time', () => {
    render(
      <DocCard
        href="/docs/d1"
        title="Q1 Roadmap brief"
        icon="🚀"
        preview="Sharing the updated roadmap for Q1."
        updatedAt={new Date(Date.now() - 60_000).toISOString()}
        contributors={[
          { id: 'u1', name: 'Veda' },
          { id: 'u2', name: 'Sarah' },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Q1 Roadmap brief' })).toBeInTheDocument()
    expect(screen.getByText('🚀')).toBeInTheDocument()
    expect(screen.getByText(/Sharing the updated roadmap/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/docs/d1')
  })

  it('falls back to title initial when no icon provided', () => {
    render(
      <DocCard
        href="/docs/d1"
        title="Onboarding"
        updatedAt={new Date().toISOString()}
      />,
    )
    expect(screen.getByText('O')).toBeInTheDocument()
  })

  it('clamps contributors to 4 + overflow chip', () => {
    const contribs = Array.from({ length: 7 }, (_, i) => ({
      id: `u${i}`,
      name: `Person ${i}`,
    }))
    render(
      <DocCard
        href="/docs/d1"
        title="x"
        updatedAt={new Date().toISOString()}
        contributors={contribs}
      />,
    )
    expect(screen.getByText('+3')).toBeInTheDocument()
  })
})

describe('DocCardEmpty', () => {
  it('fires onClick when the placeholder is clicked', () => {
    const onClick = vi.fn()
    render(<DocCardEmpty onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New doc' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('DocEditor', () => {
  function Harness() {
    const [title, setTitle] = useState('Q1 Roadmap')
    const [body, setBody] = useState('## Goals\n- Ship inbox')
    const [icon, setIcon] = useState<string | null>('📄')
    return (
      <DocEditor
        title={title}
        onTitleChange={setTitle}
        body={body}
        onBodyChange={setBody}
        icon={icon}
        onIconChange={setIcon}
      />
    )
  }

  it('renders title + icon + body', () => {
    render(<Harness />)
    expect(screen.getByDisplayValue('Q1 Roadmap')).toBeInTheDocument()
    expect(screen.getByText('📄')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/## Goals/)).toBeInTheDocument()
  })

  it('typing updates the body', () => {
    render(<Harness />)
    const ta = screen.getByPlaceholderText(/Start writing/)
    fireEvent.change(ta, { target: { value: 'Hello world' } })
    expect((ta as HTMLTextAreaElement).value).toBe('Hello world')
  })

  it('toolbar prefixes a heading marker', () => {
    render(<Harness />)
    const ta = screen.getByPlaceholderText(/Start writing/) as HTMLTextAreaElement
    ta.focus()
    ta.setSelectionRange(0, 0)
    fireEvent.click(screen.getByLabelText('Heading 1'))
    expect(ta.value.startsWith('# ')).toBe(true)
  })

  it('toolbar inserts bullet prefix on the active line', () => {
    render(<Harness />)
    const ta = screen.getByPlaceholderText(/Start writing/) as HTMLTextAreaElement
    ta.focus()
    // Position cursor on the second line ("- Ship inbox")
    const idx = ta.value.indexOf('- Ship inbox')
    ta.setSelectionRange(idx, idx)
    fireEvent.click(screen.getByLabelText('Bulleted list'))
    expect(ta.value).toContain('- - Ship inbox')
  })

  it('readOnly hides the toolbar', () => {
    render(
      <DocEditor
        title="x"
        onTitleChange={() => {}}
        body=""
        onBodyChange={() => {}}
        icon={null}
        onIconChange={() => {}}
        readOnly
      />,
    )
    expect(screen.queryByLabelText('Heading 1')).toBeNull()
  })
})
