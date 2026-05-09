'use client'

import { useEffect, useRef, useState } from 'react'
import { Bold, Code, Heading1, Heading2, Italic, List, ListOrdered, Quote } from 'lucide-react'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface DocEditorProps {
  /** Current title. Inline-editable. */
  title: string
  onTitleChange: (next: string) => void
  /** Markdown body. Saved on debounce. */
  body: string
  onBodyChange: (next: string) => void
  /** Emoji icon, inline-editable next to title. */
  icon: string | null
  onIconChange: (next: string | null) => void
  /** Optional placeholder when the body is empty. */
  bodyPlaceholder?: string
  /** Read-only mode — disables all editing. */
  readOnly?: boolean
  className?: string
}

/**
 * Lightweight Markdown editor.
 *
 * Pencil reference: `DocsV3-Editor` (`IMtz2`). The design shows H1/H2
 * headings, bullet lists, callouts, and code blocks — Markdown handles
 * all of those natively. We render a textarea (no live preview) plus a
 * formatting toolbar that wraps the current selection in the chosen
 * Markdown syntax.
 */
export function DocEditor({
  title,
  onTitleChange,
  body,
  onBodyChange,
  icon,
  onIconChange,
  bodyPlaceholder = 'Start writing… use Markdown for formatting (## heading, - bullet, > quote, `code`).',
  readOnly,
  className,
}: DocEditorProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const [iconEditing, setIconEditing] = useState(false)

  // Auto-grow textarea height to fill remaining space — simpler than a
  // contentEditable virtualized editor and good enough for medium docs.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [body])

  function wrapSelection(before: string, after = before) {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = body.slice(start, end)
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`
    onBodyChange(next)
    // Restore selection inside the wrappers on next paint.
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = start + before.length
      ta.selectionEnd = end + before.length
    })
  }

  function prefixLine(prefix: string) {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = body.lastIndexOf('\n', start - 1) + 1
    const next = `${body.slice(0, lineStart)}${prefix}${body.slice(lineStart)}`
    onBodyChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + prefix.length
    })
  }

  return (
    <div className={cn('flex h-full flex-col gap-5 px-12 py-10', className)}>
      <header className="flex items-center gap-3">
        {iconEditing ? (
          <input
            type="text"
            autoFocus
            maxLength={2}
            value={icon ?? ''}
            onChange={(e) => onIconChange(e.target.value || null)}
            onBlur={() => setIconEditing(false)}
            onKeyDown={(e) => e.key === 'Enter' && setIconEditing(false)}
            className="h-10 w-10 rounded-md border border-wm-accent bg-wm-surface text-center font-sans text-2xl text-wm-text-primary outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => !readOnly && setIconEditing(true)}
            aria-label="Change icon"
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-md font-sans text-2xl transition-colors',
              icon ? 'text-wm-text-primary' : 'text-wm-text-muted',
              !readOnly && 'cursor-pointer hover:bg-wm-surface-hover',
            )}
          >
            {icon ?? '📄'}
          </button>
        )}
        <input
          type="text"
          value={title}
          readOnly={readOnly}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled"
          className="flex-1 bg-transparent font-sans text-3xl font-bold text-wm-text-primary outline-none placeholder:text-wm-text-muted"
        />
      </header>

      {!readOnly && (
        <div className="flex items-center gap-1 border-y border-wm-border py-1.5">
          <IconButton
            aria-label="Heading 1"
            size="sm"
            onClick={() => prefixLine('# ')}
          >
            <Heading1 className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="Heading 2"
            size="sm"
            onClick={() => prefixLine('## ')}
          >
            <Heading2 className="h-4 w-4" />
          </IconButton>
          <span aria-hidden className="mx-1 h-4 w-px bg-wm-border" />
          <IconButton
            aria-label="Bold"
            size="sm"
            onClick={() => wrapSelection('**')}
          >
            <Bold className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="Italic"
            size="sm"
            onClick={() => wrapSelection('_')}
          >
            <Italic className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="Code"
            size="sm"
            onClick={() => wrapSelection('`')}
          >
            <Code className="h-4 w-4" />
          </IconButton>
          <span aria-hidden className="mx-1 h-4 w-px bg-wm-border" />
          <IconButton
            aria-label="Bulleted list"
            size="sm"
            onClick={() => prefixLine('- ')}
          >
            <List className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="Numbered list"
            size="sm"
            onClick={() => prefixLine('1. ')}
          >
            <ListOrdered className="h-4 w-4" />
          </IconButton>
          <IconButton
            aria-label="Quote"
            size="sm"
            onClick={() => prefixLine('> ')}
          >
            <Quote className="h-4 w-4" />
          </IconButton>
        </div>
      )}

      <textarea
        ref={taRef}
        value={body}
        readOnly={readOnly}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={bodyPlaceholder}
        className="flex-1 resize-none bg-transparent font-sans text-[14px] leading-[1.7] text-wm-text-primary outline-none placeholder:text-wm-text-muted"
      />
    </div>
  )
}
