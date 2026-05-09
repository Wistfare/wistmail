'use client'

import { useState } from 'react'
import { Send, Trash2 } from 'lucide-react'
import { Avatar, IconButton } from '@/components/ui'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  useAddDocComment,
  useDeleteDocComment,
  useDocComments,
  type DocComment,
} from '@/lib/doc-queries'

export interface DocCommentsProps {
  docId: string
  /** Current viewer — used to determine which comments expose a delete button. */
  viewerId: string
  /** Optional viewer name for the composer avatar. */
  viewerName?: string
  className?: string
}

/**
 * Right-rail comments thread on the doc editor.
 *
 * Pencil reference: `DocsV3-Editor` (`IMtz2`) right column. Bottom
 * composer always visible; comments scroll above. Author can soft-delete
 * their own comments via the trailing trash icon (the API endpoint
 * marks `deleted_at`; the list query then filters them out).
 */
export function DocComments({ docId, viewerId, viewerName, className }: DocCommentsProps) {
  const list = useDocComments(docId)
  const add = useAddDocComment(docId)
  const remove = useDeleteDocComment(docId)
  const [draft, setDraft] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    await add.mutateAsync(body)
    setDraft('')
  }

  return (
    <aside
      className={cn(
        'flex w-72 shrink-0 flex-col border-l border-wm-border bg-wm-bg',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-wm-border px-5 py-3.5">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
          Comments
        </span>
        <span className="font-mono text-[10px] text-wm-text-muted">
          {list.data?.length ?? 0}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {list.isPending ? (
          <p className="text-center font-mono text-[11px] text-wm-text-muted">
            Loading…
          </p>
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-center font-mono text-[11px] text-wm-text-muted">
            No comments yet. Start the discussion.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {(list.data ?? []).map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                isMine={c.authorId === viewerId}
                onDelete={() => remove.mutate(c.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex items-end gap-2 border-t border-wm-border px-4 py-3"
      >
        <Avatar name={viewerName ?? 'You'} size="sm" />
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit(e as unknown as React.FormEvent)
            }
          }}
          placeholder="Add a comment…"
          rows={1}
          className="min-h-9 flex-1 resize-none rounded-md border border-wm-border bg-wm-surface px-3 py-1.5 font-sans text-[12px] text-wm-text-primary outline-none placeholder:text-wm-text-muted focus:border-wm-accent"
        />
        <button
          type="submit"
          disabled={!draft.trim() || add.isPending}
          aria-label="Post comment"
          className={cn(
            'flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors',
            !draft.trim() || add.isPending
              ? 'bg-wm-surface text-wm-text-muted'
              : 'bg-wm-accent text-wm-text-on-accent hover:bg-wm-accent-hover',
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </aside>
  )
}

function CommentRow({
  comment,
  isMine,
  onDelete,
}: {
  comment: DocComment
  isMine: boolean
  onDelete: () => void
}) {
  return (
    <li className="flex gap-2.5">
      <Avatar name={isMine ? 'You' : 'Member'} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <header className="flex items-center justify-between gap-2">
          <span className="font-sans text-[12px] font-semibold text-wm-text-primary">
            {isMine ? 'You' : 'Member'}
          </span>
          <span className="font-mono text-[10px] text-wm-text-tertiary">
            {formatRelativeTime(new Date(comment.createdAt))}
          </span>
        </header>
        <p className="font-sans text-[12.5px] leading-[1.55] text-wm-text-secondary">
          {comment.body}
        </p>
        {isMine && (
          <div className="self-end">
            <IconButton
              aria-label="Delete comment"
              size="sm"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </IconButton>
          </div>
        )}
      </div>
    </li>
  )
}
