import './global.css'
import { RootProvider } from 'fumadocs-ui/provider'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: {
    template: '%s | WistMail Docs',
    default: 'WistMail Documentation',
  },
  description: 'API reference and SDK documentation for the WistMail email platform',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
