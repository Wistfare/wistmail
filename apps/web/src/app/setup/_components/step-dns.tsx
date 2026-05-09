'use client'

import { useState } from 'react'
import { ChevronRight, Cloud, Settings2 } from 'lucide-react'
import { StepDnsCloudflare } from './step-dns-cloudflare'
import { StepDnsManual } from './step-dns-manual'
import { StepDnsVerification } from './step-dns-verification'

type DnsRecord = {
  type: string
  name: string
  value: string
  priority?: number
  verified: boolean
}

type DnsView = 'choose' | 'cloudflare' | 'manual' | 'verifying'

interface StepDnsProps {
  domain: string
  records: DnsRecord[]
  onNext: () => void
}

/**
 * `/setup` step 2 — Pencil reference: `Screen/SetupV3-DNS-Choose` (`iYWpV`).
 *
 * formPane (gap 24 vertical):
 *   fHd:
 *     "STEP 2 · DNS"          — 11/700 lime tracking 2
 *     "Configure DNS records" — 30/700 white
 *     desc                    — 13/500 #6e6e6e line-height 1.6 fixed-width
 *   tileCF (lime-bordered "Connect with Cloudflare" card):
 *     radius 14, padding [20, 22], gap 12, 1px lime stroke
 *       t1H (justify between):
 *         t1HL (gap 14):
 *           48×48 lime tile (radius 12), cloud 24×24 black
 *           col (gap 3):
 *             "Connect with Cloudflare" 18/700 white
 *             "Automatically configure all DNS records with one click." 11/500 #6e6e6e
 *         recChip: radius 14, lime fill, padding [5,10], "RECOMMENDED" 9/700 black tracking 1.5
 *       t1Tags (gap 6, padding [4, 0, 0, 62]):
 *         MX 9/700 #3B82F6 tracking 1
 *         · 9 #6e6e6e
 *         SPF 9/700 lime
 *         · 9 #6e6e6e
 *         DKIM 9/700 #F59E0B
 *         · 9 #6e6e6e
 *         DMARC 9/700 #FF4D8B
 *   tileMan (neutral "Manual configuration" card):
 *     radius 14, fill #111, padding [20,22], gap 14, 1px #1A1A1A stroke, alignItems center
 *       48×48 #000 tile (radius 12, 1px #1A1A1A stroke), settings-2 22×22 #999999
 *       col (gap 3):
 *         "Manual configuration" 16/700 white
 *         "Copy DNS records to your provider manually." 11/500 #6e6e6e
 *       chevron-right 18×18 #6e6e6e
 */
export function StepDns({ domain, records, onNext }: StepDnsProps) {
  const [view, setView] = useState<DnsView>('choose')

  if (view === 'cloudflare') {
    return (
      <StepDnsCloudflare
        onStartVerification={() => setView('verifying')}
        onBack={() => setView('choose')}
      />
    )
  }
  if (view === 'manual') {
    return (
      <StepDnsManual
        domain={domain}
        records={records}
        onStartVerification={() => setView('verifying')}
        onBack={() => setView('choose')}
      />
    )
  }
  if (view === 'verifying') {
    return <StepDnsVerification onNext={onNext} onBack={() => setView('choose')} />
  }

  return (
    <div
      className="mx-auto flex w-full max-w-[520px] flex-col"
      style={{ gap: 24 }}
    >
      {/* fHd */}
      <div className="flex w-full flex-col" style={{ gap: 8 }}>
        <p
          className="font-mono font-bold uppercase text-wm-accent"
          style={{ fontSize: 11, letterSpacing: 2 }}
        >
          Step 2 · DNS
        </p>
        <h1
          className="font-mono font-bold leading-tight text-wm-text-primary"
          style={{ fontSize: 30 }}
        >
          Configure DNS records
        </h1>
        <p
          className="font-mono font-medium"
          style={{ fontSize: 13, lineHeight: 1.6, color: '#6e6e6e' }}
        >
          Set up DNS records for {domain}. Choose how you&rsquo;d like to
          configure them.
        </p>
      </div>

      {/* tileCF — recommended Cloudflare card */}
      <button
        type="button"
        onClick={() => setView('cloudflare')}
        className="flex w-full cursor-pointer flex-col text-left transition-opacity hover:opacity-95"
        style={{
          borderRadius: 14,
          padding: '20px 22px',
          gap: 12,
          border: '1px solid var(--color-wm-accent)',
        }}
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center" style={{ gap: 14 }}>
            <span
              aria-hidden
              className="flex items-center justify-center bg-wm-accent"
              style={{ width: 48, height: 48, borderRadius: 12 }}
            >
              <Cloud style={{ width: 24, height: 24, color: '#000000' }} />
            </span>
            <div className="flex flex-col" style={{ gap: 3 }}>
              <span
                className="font-mono font-bold text-wm-text-primary"
                style={{ fontSize: 18 }}
              >
                Connect with Cloudflare
              </span>
              <span
                className="font-mono font-medium"
                style={{ fontSize: 11, color: '#6e6e6e' }}
              >
                Automatically configure all DNS records with one click.
              </span>
            </div>
          </div>
          <span
            className="font-mono font-bold uppercase"
            style={{
              borderRadius: 14,
              background: 'var(--color-wm-accent)',
              color: '#000000',
              padding: '5px 10px',
              fontSize: 9,
              letterSpacing: 1.5,
            }}
          >
            Recommended
          </span>
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: 6, paddingLeft: 62 }}>
          <DnsTag color="#3B82F6">MX</DnsTag>
          <DnsTagDot />
          <DnsTag color="#BFFF00">SPF</DnsTag>
          <DnsTagDot />
          <DnsTag color="#F59E0B">DKIM</DnsTag>
          <DnsTagDot />
          <DnsTag color="#FF4D8B">DMARC</DnsTag>
        </div>
      </button>

      {/* tileMan — manual configuration card */}
      <button
        type="button"
        onClick={() => setView('manual')}
        className="flex w-full cursor-pointer items-center bg-wm-surface text-left transition-colors hover:bg-wm-surface-hover"
        style={{
          borderRadius: 14,
          padding: '20px 22px',
          gap: 14,
          border: '1px solid var(--color-wm-border)',
        }}
      >
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center bg-wm-bg"
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            border: '1px solid var(--color-wm-border)',
          }}
        >
          <Settings2 style={{ width: 22, height: 22, color: '#999999' }} />
        </span>
        <div className="flex flex-1 flex-col" style={{ gap: 3 }}>
          <span
            className="font-mono font-bold text-wm-text-primary"
            style={{ fontSize: 16 }}
          >
            Manual configuration
          </span>
          <span
            className="font-mono font-medium"
            style={{ fontSize: 11, color: '#6e6e6e' }}
          >
            Copy DNS records to your provider manually.
          </span>
        </div>
        <ChevronRight
          aria-hidden
          style={{ width: 18, height: 18, color: '#6e6e6e' }}
        />
      </button>
    </div>
  )
}

function DnsTag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="font-mono font-bold uppercase"
      style={{ fontSize: 9, letterSpacing: 1, color }}
    >
      {children}
    </span>
  )
}

function DnsTagDot() {
  return (
    <span
      aria-hidden
      className="font-mono"
      style={{ fontSize: 9, color: '#6e6e6e' }}
    >
      ·
    </span>
  )
}
