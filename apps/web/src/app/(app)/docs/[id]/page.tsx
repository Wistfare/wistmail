'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Link as LinkIcon, MoreHorizontal, Share2, Sparkles, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import { Button, IconButton, Menu } from '@/components/ui'
import { useToast } from '@/components/ui/toast'
import { useSessionUser } from '@/lib/session-user-context'
import {
  DocComments,
  DocEditor,
  DocOutline,
  DocStatusPill,
} from '@/components/docs'
import {
  useDeleteDoc,
  useDoc,
  useRevokeShare,
  useShareDoc,
  useUpdateDoc,
  type DocStatus,
} from '@/lib/doc-queries'
import { extractOutline } from '@/lib/doc-outline'
import { cn, formatRelativeTime } from '@/lib/utils'

const AUTOSAVE_DELAY_MS = 800

/**
 * `/docs/[id]` — Pencil reference: `DocsV3-Editor` (`IMtz2`).
 *
 * Three-column layout:
 *   [DocOutline]  [editor + AI brief]  [DocComments]
 *
 * The editor's title + icon + Markdown body autosave on a debounce.
 * Status pill + Share button live in the page header.
 */
export default function DocDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id
  const doc = useDoc(id)
  const update = useUpdateDoc()
  const remove = useDeleteDoc()
  const share = useShareDoc()
  const revoke = useRevokeShare()
  const toast = useToast()
  const session = useSessionUser()

  // Local state — kept in sync with the fetched doc, but the user
  // edits this copy directly so the editor stays buttery.
  const [title, setTitle] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<DocStatus>('draft')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [activeHeading, setActiveHeading] = useState<string | undefined>()
  const lastSent = useRef<{
    title: string
    icon: string | null
    body: string
    status: DocStatus
  } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hydrate local state from the server. Only overwrite if the server
  // came back with newer data than what we last sent — protects against
  // wiping in-flight typing on a refetch.
  useEffect(() => {
    if (!doc.data) return
    const remote = doc.data
    if (
      lastSent.current &&
      lastSent.current.title === remote.title &&
      lastSent.current.icon === remote.icon &&
      lastSent.current.body === (remote.body ?? '') &&
      lastSent.current.status === remote.status
    ) {
      return
    }
    setTitle(remote.title)
    setIcon(remote.icon)
    setBody(remote.body ?? '')
    setStatus(remote.status)
    setSavedAt(remote.updatedAt)
  }, [doc.data])

  // Debounced autosave. Compare against `lastSent` so we don't fire
  // identical patches.
  useEffect(() => {
    if (!doc.data) return
    if (timer.current) clearTimeout(timer.current)
    const next = { title, icon, body, status }
    if (
      lastSent.current &&
      lastSent.current.title === next.title &&
      lastSent.current.icon === next.icon &&
      lastSent.current.body === next.body &&
      lastSent.current.status === next.status
    ) {
      return
    }
    if (
      next.title === doc.data.title &&
      next.icon === doc.data.icon &&
      next.body === (doc.data.body ?? '') &&
      next.status === doc.data.status
    ) {
      return
    }
    timer.current = setTimeout(async () => {
      lastSent.current = next
      try {
        await update.mutateAsync({ id, ...next })
        setSavedAt(new Date().toISOString())
      } catch {
        // Optimistic update will roll back automatically.
      }
    }, AUTOSAVE_DELAY_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, icon, body, status])

  const outline = useMemo(() => extractOutline(body), [body])

  async function handleDelete() {
    if (!doc.data) return
    if (!confirm(`Delete “${doc.data.title}”? This cannot be undone.`)) return
    await remove.mutateAsync(id)
    router.push('/docs')
  }

  async function handleShare() {
    if (!doc.data) return
    if (doc.data.shareToken) {
      // Already shared — copy link.
      await navigator.clipboard.writeText(buildShareUrl(doc.data.shareToken))
      toast.show({ message: 'Share link copied to clipboard.' })
      return
    }
    try {
      const res = await share.mutateAsync(id)
      await navigator.clipboard.writeText(buildShareUrl(res.shareToken))
      toast.show({
        message: 'Share link created and copied.',
        undo: () => revoke.mutateAsync(id).then(() => undefined),
      })
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'Could not create share link.',
      })
    }
  }

  if (doc.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
      </div>
    )
  }

  if (doc.isError || !doc.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="font-mono text-sm text-wm-error">Couldn’t load that doc.</p>
        <Link href="/docs">
          <Button variant="secondary">Back to docs</Button>
        </Link>
      </div>
    )
  }

  function pickHeading(headingId: string) {
    setActiveHeading(headingId)
    if (typeof document === 'undefined') return
    const el = document.getElementById(headingId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={
          <Link
            href="/docs"
            className="inline-flex items-center gap-1 hover:text-wm-accent"
          >
            <ArrowLeft className="h-3 w-3" />
            All docs
          </Link>
        }
        title={title || 'Untitled doc'}
        subtitle={
          savedAt ? <SaveIndicator savedAt={savedAt} pending={update.isPending} /> : undefined
        }
        actions={
          <>
            <DocStatusPill status={status} onChange={setStatus} />
            <Button
              variant="secondary"
              onClick={handleShare}
              icon={
                doc.data.shareToken ? (
                  <LinkIcon className="h-3.5 w-3.5" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )
              }
            >
              {doc.data.shareToken ? 'Copy link' : 'Share'}
            </Button>
            <Menu align="end">
              <Menu.Trigger>
                <IconButton aria-label="Doc actions" variant="surface">
                  <MoreHorizontal className="h-4 w-4" />
                </IconButton>
              </Menu.Trigger>
              <Menu.Items>
                {doc.data.shareToken && (
                  <Menu.Item
                    icon={<LinkIcon className="h-3.5 w-3.5" />}
                    onClick={() => {
                      revoke.mutate(id)
                      toast.show({ message: 'Share link revoked.' })
                    }}
                  >
                    Revoke share link
                  </Menu.Item>
                )}
                <Menu.Item
                  destructive
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={handleDelete}
                >
                  Delete doc
                </Menu.Item>
              </Menu.Items>
            </Menu>
          </>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <DocOutline outline={outline} activeId={activeHeading} onPick={pickHeading} />
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* AI brief block at top of body — placeholder until the AI
              service emits per-doc summaries. Pencil shows this as a
              lime pill above the body in `IMtz2`. */}
          <div className={cn('px-12 pt-10')}>
            <div className="mb-6 flex items-center gap-2 rounded-full border border-wm-accent/40 bg-wm-accent-dim px-3 py-1.5 text-wm-accent">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px]">
                AI brief — coming soon
              </span>
            </div>
          </div>
          <DocEditor
            title={title}
            onTitleChange={setTitle}
            body={body}
            onBodyChange={setBody}
            icon={icon}
            onIconChange={setIcon}
          />
        </div>
        <DocComments
          docId={id}
          viewerId={session.id}
          viewerName={session.name}
        />
      </div>
    </div>
  )
}

function SaveIndicator({ savedAt, pending }: { savedAt: string; pending: boolean }) {
  if (pending) return <>Saving…</>
  return <>Saved {formatRelativeTime(new Date(savedAt))}</>
}

function buildShareUrl(token: string): string {
  if (typeof window === 'undefined') return `/share/docs/${token}`
  return `${window.location.origin}/share/docs/${token}`
}
