'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import { Button, EmptyState } from '@/components/ui'
import { DocCard, DocCardEmpty } from '@/components/docs'
import { useCreateDoc, useDocs } from '@/lib/doc-queries'
import { cn } from '@/lib/utils'

/**
 * `/docs` — Pencil reference: `DocsV3` (`sOpka`).
 *
 * Card grid of all docs. Filter chips for category / status are stubs
 * for now — clicking them is a no-op until the backend supports them.
 */
export default function DocsIndexPage() {
  const router = useRouter()
  const docs = useDocs()
  const create = useCreateDoc()
  const [query, setQuery] = useState('')

  const filtered = (docs.data ?? []).filter((d) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      d.title.toLowerCase().includes(q) ||
      (d.body ?? '').toLowerCase().includes(q)
    )
  })

  async function handleCreate() {
    const created = await create.mutateAsync({
      title: 'Untitled doc',
      icon: '📄',
      body: '',
    })
    router.push(`/docs/${created.id}`)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Docs"
        title="All docs"
        subtitle={
          docs.data
            ? `${docs.data.length} doc${docs.data.length === 1 ? '' : 's'}`
            : undefined
        }
        actions={
          <>
            <SearchField value={query} onChange={setQuery} />
            <Button
              icon={<Plus className="h-3.5 w-3.5" />}
              loading={create.isPending}
              onClick={handleCreate}
            >
              New doc
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {docs.isPending ? (
          <div className="flex h-32 items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
          </div>
        ) : !docs.data || docs.data.length === 0 ? (
          <EmptyState
            title="No docs yet"
            description="Briefs, runbooks, retros — keep your team's knowledge alongside the work it serves."
            action={
              <Button
                icon={<Plus className="h-3.5 w-3.5" />}
                loading={create.isPending}
                onClick={handleCreate}
              >
                Create first doc
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((d, i) => (
              <DocCard
                key={d.id}
                href={`/docs/${d.id}`}
                title={d.title}
                icon={d.icon}
                preview={d.body ? plainText(d.body, 200) : null}
                updatedAt={d.updatedAt}
                highlighted={i === 0 && filtered.length > 1}
              />
            ))}
            <DocCardEmpty onClick={handleCreate} />
          </div>
        )}
      </div>
    </div>
  )
}

function SearchField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div
      className={cn(
        'flex h-9 w-64 items-center gap-2 rounded-md border border-wm-border bg-wm-surface px-3',
        'transition-colors focus-within:border-wm-accent',
      )}
    >
      <Search className="h-3.5 w-3.5 text-wm-text-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search docs…"
        className="flex-1 bg-transparent font-mono text-[12px] text-wm-text-primary placeholder:text-wm-text-muted outline-none"
      />
    </div>
  )
}

function plainText(markdown: string, limit: number): string {
  // Strip Markdown-ish syntax for the card preview. Not exhaustive —
  // good enough for the 2-line snippet.
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>~-]/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
}
