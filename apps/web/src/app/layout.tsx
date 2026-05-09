import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Wistfare Mail',
  description:
    'Open-source email platform. Self-hostable email client + transactional email API.',
  // Favicons are auto-detected from `src/app/icon.png` and
  // `src/app/apple-icon.png` — Next.js generates the correct
  // <link rel="icon"> / <link rel="apple-touch-icon"> tags at build
  // time. No manual `icons` mapping needed.
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
