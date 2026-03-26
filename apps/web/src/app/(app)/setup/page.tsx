'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Server, Mail, CheckCircle2, ArrowRight, ArrowLeft, Copy, Check, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { api } from '@/lib/api-client'
import { useWizard } from '@/hooks/use-wizard'

type WizardData = {
  domainId: string
  domainName: string
  records: Array<{ type: string; name: string; value: string; priority?: number; verified: boolean }>
  verification: { mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean } | null
  mailboxId: string
  mailboxAddress: string
}

const STEPS = [
  { icon: Globe, label: 'Domain', description: 'Add your domain' },
  { icon: Server, label: 'DNS', description: 'Configure DNS records' },
  { icon: Mail, label: 'Mailbox', description: 'Create your first email' },
  { icon: CheckCircle2, label: 'Done', description: 'Setup complete' },
]

export default function SetupPage() {
  const router = useRouter()
  const wizard = useWizard<WizardData>(4)
  const [error, setError] = useState('')

  return (
    <div className="flex min-h-screen">
      {/* Left branding column */}
      <div className="hidden w-1/2 flex-col items-center justify-center gap-10 bg-wm-surface p-16 lg:flex">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center bg-wm-accent">
            <span className="font-sans text-2xl font-bold text-wm-text-on-accent">W</span>
          </div>
          <span className="font-mono text-2xl font-semibold tracking-widest text-wm-text-primary">
            WISTMAIL
          </span>
        </div>

        {/* Step indicator */}
        <div className="flex flex-col gap-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const isActive = i === wizard.step
            const isDone = i < wizard.step
            return (
              <div key={i} className="flex items-center gap-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center ${
                    isDone
                      ? 'bg-wm-accent'
                      : isActive
                        ? 'bg-wm-accent'
                        : 'border border-wm-border'
                  }`}
                >
                  {isDone ? (
                    <Check className="h-5 w-5 text-wm-text-on-accent" />
                  ) : (
                    <Icon
                      className={`h-5 w-5 ${isActive ? 'text-wm-text-on-accent' : 'text-wm-text-muted'}`}
                    />
                  )}
                </div>
                <div>
                  <p
                    className={`font-mono text-sm font-medium ${isActive ? 'text-wm-accent' : isDone ? 'text-wm-text-secondary' : 'text-wm-text-muted'}`}
                  >
                    {s.label}
                  </p>
                  <p className="font-mono text-xs text-wm-text-muted">{s.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right form column */}
      <div className="flex w-full flex-col items-center justify-center p-8 lg:w-1/2 lg:p-16">
        <div className="w-full max-w-md">
          {wizard.step === 0 && (
            <StepDomain wizard={wizard} error={error} setError={setError} />
          )}
          {wizard.step === 1 && (
            <StepDns wizard={wizard} error={error} setError={setError} />
          )}
          {wizard.step === 2 && (
            <StepMailbox wizard={wizard} error={error} setError={setError} />
          )}
          {wizard.step === 3 && <StepDone router={router} />}
        </div>
      </div>
    </div>
  )
}

// ── Step 1: Domain ──────────────────────────────────────────────────────────

function StepDomain({
  wizard,
  error,
  setError,
}: {
  wizard: ReturnType<typeof useWizard<WizardData>>
  error: string
  setError: (e: string) => void
}) {
  const [domain, setDomain] = useState(wizard.data.domainName || '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!domain.trim()) {
      setError('Domain is required')
      return
    }

    wizard.setLoading(true)
    setError('')

    try {
      const result = await api.post<{
        id: string
        name: string
        records: WizardData['records']
      }>('/api/v1/setup/domain', { name: domain })

      wizard.updateData({
        domainId: result.id,
        domainName: result.name,
        records: result.records,
      })
      wizard.next()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      wizard.setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-wm-text-primary">Add your domain</h2>
        <p className="mt-2 font-mono text-sm text-wm-text-tertiary">
          Enter the domain you want to use for sending and receiving email.
        </p>
      </div>

      <InputField
        label="Domain name"
        icon={<Globe className="h-[18px] w-[18px]" />}
        placeholder="example.com"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        error={error}
      />

      <Button type="submit" variant="primary" loading={wizard.loading} icon={<ArrowRight className="h-4 w-4" />}>
        Continue
      </Button>
    </form>
  )
}

// ── Step 2: DNS Records ─────────────────────────────────────────────────────

function StepDns({
  wizard,
  error,
  setError,
}: {
  wizard: ReturnType<typeof useWizard<WizardData>>
  error: string
  setError: (e: string) => void
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [verifying, setVerifying] = useState(false)

  async function copyValue(value: string, idx: number) {
    await navigator.clipboard.writeText(value)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  async function handleVerify() {
    setVerifying(true)
    setError('')
    try {
      const result = await api.post<{
        mx: boolean
        spf: boolean
        dkim: boolean
        dmarc: boolean
        verified: boolean
      }>(`/api/v1/setup/domain/${wizard.data.domainId}/verify`)

      wizard.updateData({ verification: result })

      if (result.verified) {
        wizard.next()
      } else {
        setError('Some DNS records are not yet propagated. This can take up to 48 hours.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const records = wizard.data.records || []
  const verification = wizard.data.verification

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-wm-text-primary">Configure DNS records</h2>
        <p className="mt-2 font-mono text-sm text-wm-text-tertiary">
          Add these records to your DNS provider for{' '}
          <span className="text-wm-accent">{wizard.data.domainName}</span>
        </p>
      </div>

      <div className="flex flex-col border border-wm-border">
        {records.map((record, idx) => {
          const verKey = record.type === 'MX' ? 'mx' : record.name.includes('_dkim') ? 'dkim' : record.name.includes('_dmarc') ? 'dmarc' : 'spf'
          const isVerified = verification?.[verKey as keyof typeof verification]

          return (
            <div
              key={idx}
              className="flex items-center gap-3 border-b border-wm-border p-3 last:border-b-0"
            >
              <span
                className={`font-mono text-xs font-bold ${
                  record.type === 'MX' ? 'text-wm-info' : 'text-wm-warning'
                }`}
              >
                {record.type === 'MX' ? 'MX' : record.name.includes('_dkim') ? 'DKIM' : record.name.includes('_dmarc') ? 'DMARC' : 'SPF'}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate font-mono text-xs text-wm-text-primary">{record.name}</p>
                <p className="truncate font-mono text-[10px] text-wm-text-muted">
                  {record.value.length > 60 ? record.value.slice(0, 60) + '...' : record.value}
                </p>
              </div>
              {verification && (
                <div className="flex items-center gap-1">
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${isVerified ? 'bg-wm-accent' : 'bg-wm-warning'}`}
                  />
                  <span
                    className={`font-mono text-[10px] font-semibold ${isVerified ? 'text-wm-accent' : 'text-wm-warning'}`}
                  >
                    {isVerified ? 'OK' : 'Pending'}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => copyValue(record.value, idx)}
                className="cursor-pointer text-wm-text-muted transition-colors hover:text-wm-text-secondary"
              >
                {copiedIdx === idx ? (
                  <Check className="h-3.5 w-3.5 text-wm-accent" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )
        })}
      </div>

      {error && <p className="font-mono text-xs text-wm-warning">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={wizard.back} icon={<ArrowLeft className="h-4 w-4" />}>
          Back
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleVerify}
          loading={verifying}
          icon={<RefreshCw className="h-4 w-4" />}
          className="flex-1"
        >
          Verify DNS
        </Button>
        <Button type="button" variant="ghost" onClick={wizard.next}>
          Skip for now
        </Button>
      </div>
    </div>
  )
}

// ── Step 3: Mailbox ─────────────────────────────────────────────────────────

function StepMailbox({
  wizard,
  error,
  setError,
}: {
  wizard: ReturnType<typeof useWizard<WizardData>>
  error: string
  setError: (e: string) => void
}) {
  const [localPart, setLocalPart] = useState('')
  const [displayName, setDisplayName] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!localPart.trim()) {
      setError('Email address is required')
      return
    }
    if (!displayName.trim()) {
      setError('Display name is required')
      return
    }

    wizard.setLoading(true)
    setError('')

    try {
      const result = await api.post<{ id: string; address: string }>('/api/v1/setup/mailbox', {
        address: localPart,
        displayName,
        domainId: wizard.data.domainId,
      })

      wizard.updateData({
        mailboxId: result.id,
        mailboxAddress: result.address,
      })
      wizard.next()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create mailbox')
    } finally {
      wizard.setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-wm-text-primary">Create your first mailbox</h2>
        <p className="mt-2 font-mono text-sm text-wm-text-tertiary">
          Set up an email address on{' '}
          <span className="text-wm-accent">{wizard.data.domainName}</span>
        </p>
      </div>

      <InputField
        label="Display name"
        placeholder="Your Name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />

      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-sm font-medium text-wm-text-secondary">Email address</label>
        <div className="flex">
          <input
            type="text"
            value={localPart}
            onChange={(e) => setLocalPart(e.target.value)}
            placeholder="you"
            className="flex-1 border border-r-0 border-wm-border bg-wm-surface px-4 py-3 font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none focus:border-wm-accent focus:ring-1 focus:ring-wm-accent"
          />
          <div className="flex items-center border border-l-0 border-wm-border bg-wm-bg px-4 py-3">
            <span className="font-mono text-sm text-wm-text-muted">@{wizard.data.domainName}</span>
          </div>
        </div>
      </div>

      {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={wizard.back} icon={<ArrowLeft className="h-4 w-4" />}>
          Back
        </Button>
        <Button type="submit" variant="primary" loading={wizard.loading} icon={<ArrowRight className="h-4 w-4" />} className="flex-1">
          Create Mailbox
        </Button>
      </div>
    </form>
  )
}

// ── Step 4: Done ────────────────────────────────────────────────────────────

function StepDone({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center bg-wm-accent">
        <CheckCircle2 className="h-8 w-8 text-wm-text-on-accent" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold text-wm-text-primary">You&apos;re all set!</h2>
        <p className="mt-2 font-mono text-sm text-wm-text-tertiary">
          Your email infrastructure is ready. Start sending and receiving emails.
        </p>
      </div>
      <Button
        type="button"
        variant="primary"
        onClick={() => router.push('/inbox')}
        icon={<ArrowRight className="h-4 w-4" />}
        className="w-full"
      >
        Go to Inbox
      </Button>
    </div>
  )
}
