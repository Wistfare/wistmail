'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Copy, Download, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'wm_fresh_backup_codes'

export default function BackupCodesPage() {
  const router = useRouter()
  const [codes, setCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      router.replace('/settings/two-factor')
      return
    }
    try {
      const parsed = JSON.parse(raw) as string[]
      if (!Array.isArray(parsed) || parsed.length === 0) {
        router.replace('/settings/two-factor')
        return
      }
      setCodes(parsed)
    } catch {
      router.replace('/settings/two-factor')
    }
  }, [router])

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  function download() {
    const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wistfare-mail-backup-codes.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function done() {
    sessionStorage.removeItem(STORAGE_KEY)
    router.push('/settings/two-factor')
  }

  if (codes.length === 0) return null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Backup codes</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Use one if you ever can&apos;t reach your authenticator or backup email. Each code works exactly once.
        </p>
      </div>

      <div className="flex items-start gap-3 border border-wm-error/30 bg-wm-error/10 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-wm-error" />
        <div className="flex flex-col">
          <p className="font-mono text-xs font-semibold text-wm-error">
            Save these now. We won&apos;t show them again.
          </p>
          <p className="font-mono text-[11px] text-wm-text-tertiary">
            Store them in a password manager or print them and keep them somewhere safe.
          </p>
        </div>
      </div>

      <div className="border border-wm-border bg-wm-surface p-6">
        <div className="grid grid-cols-2 gap-3">
          {codes.map((code, i) => (
            <div
              key={i}
              className="flex items-center gap-2 border border-wm-border bg-wm-bg px-3 py-2.5"
            >
              <span className="font-mono text-[10px] text-wm-text-muted">{(i + 1).toString().padStart(2, '0')}</span>
              <span className="font-mono text-sm font-semibold tracking-[0.15em] text-wm-text-primary">
                {code}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              onClick={copyAll}
            >
              {copied ? 'Copied' : 'Copy all'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={download}
            >
              Download .txt
            </Button>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<ArrowRight className="h-3.5 w-3.5" />}
            onClick={done}
          >
            I&rsquo;ve saved them
          </Button>
        </div>
      </div>
    </div>
  )
}
