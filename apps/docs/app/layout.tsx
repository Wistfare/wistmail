import './global.css'
import { RootProvider } from 'fumadocs-ui/provider'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { source } from '@/lib/source'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: {
    template: '%s | Wistfare Mail Docs',
    default: 'Wistfare Mail Documentation',
  },
  description: 'API reference and SDK documentation for the Wistfare Mail email platform',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>
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
        </RootProvider>
      </body>
    </html>
  )
}
