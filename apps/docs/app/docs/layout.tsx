import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'
import { source } from '@/lib/source'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <span className="flex items-center gap-2 font-bold">
            <span className="flex h-6 w-6 items-center justify-center bg-fd-primary text-xs font-bold text-fd-primary-foreground">
              W
            </span>
            Wistfare Mail
          </span>
        ),
      }}
    >
      {children}
    </DocsLayout>
  )
}
