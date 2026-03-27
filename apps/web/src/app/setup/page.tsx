'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Server, Mail, CheckCircle2, ArrowRight, ArrowLeft, Copy, Check, RefreshCw, User, Lock, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'

type DnsRecord = { type: string; name: string; value: string; priority?: number; verified: boolean }
type DnsStatus = { mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean; verified: boolean }

const STEPS = [
  { id: 'domain', label: 'Domain', desc: 'Add your domain', icon: Globe },
  { id: 'dns', label: 'DNS', desc: 'Configure DNS records', icon: Server },
  { id: 'account', label: 'Account', desc: 'Create admin account', icon: User },
  { id: 'done', label: 'Done', desc: 'Setup complete', icon: CheckCircle2 },
]

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 0: Domain
  const [domain, setDomain] = useState('')
  const [, setDomainId] = useState('')
  const [records, setRecords] = useState<DnsRecord[]>([])

  // Step 1: DNS
  const [dnsStatus, setDnsStatus] = useState<DnsStatus | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  // Step 2: Account
  const [displayName, setDisplayName] = useState('')
  const [emailLocal, setEmailLocal] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Check if setup is already in progress (resume)
  useEffect(() => {
    api.get<{ hasUsers: boolean; inProgress: boolean; step: string | null; domainId: string | null }>('/api/v1/setup/status')
      .then((res) => {
        if (res.hasUsers) {
          // System already set up — go to login
          router.replace('/login')
          return
        }
        if (res.inProgress && res.step && res.domainId) {
          // Resume setup
          setDomainId(res.domainId)
          const stepIdx = STEPS.findIndex((s) => s.id === res.step)
          if (stepIdx >= 0) setStep(stepIdx)
          // Fetch domain records
          api.get<{ name: string; records: DnsRecord[]; mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean }>('/api/v1/setup/domain/records')
            .then((r) => {
              setDomain(r.name)
              setRecords(r.records)
              setDnsStatus({ mx: r.mx, spf: r.spf, dkim: r.dkim, dmarc: r.dmarc, verified: r.mx && r.spf && r.dkim && r.dmarc })
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [router])

  // Step 0: Submit domain
  async function handleDomainSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!domain.trim()) return

    setLoading(true)
    setError('')
    try {
      const res = await api.post<{ id: string; name: string; records: DnsRecord[] }>('/api/v1/setup/domain', { name: domain.trim() })
      setDomainId(res.id)
      setRecords(res.records)
      setStep(1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      setLoading(false)
    }
  }

  // Step 1: Verify DNS
  async function handleVerifyDns() {
    setVerifying(true)
    try {
      const res = await api.post<DnsStatus>('/api/v1/setup/domain/verify')
      setDnsStatus(res)
    } catch {} finally {
      setVerifying(false)
    }
  }

  async function handleSkipDns() {
    try {
      await api.post('/api/v1/setup/skip-dns')
      setStep(2)
    } catch {}
  }

  function handleDnsContinue() {
    setStep(2)
  }

  // Step 2: Create account
  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/api/v1/setup/account', {
        displayName,
        emailLocal,
        password,
      })
      setStep(3)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  // Copy to clipboard
  function copyToClipboard(text: string, idx: number) {
    navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const passwordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
  }

  return (
    <div className="flex min-h-screen bg-wm-bg">
      {/* Left panel — branding + steps */}
      <div className="flex w-[45%] flex-col items-center justify-center bg-wm-surface p-12">
        <div className="mb-12 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-wm-accent">
            <span className="text-lg font-bold text-wm-text-on-accent">W</span>
          </div>
          <span className="font-mono text-xl font-semibold tracking-[3px] text-wm-text-primary">WISTMAIL</span>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const completed = i < step
            const active = i === step
            return (
              <div key={s.id} className="flex items-center gap-4">
                <div className={`flex h-10 w-10 items-center justify-center ${completed ? 'bg-wm-accent' : active ? 'bg-wm-accent' : 'border border-wm-border'}`}>
                  {completed ? (
                    <Check className="h-5 w-5 text-wm-text-on-accent" />
                  ) : (
                    <Icon className={`h-5 w-5 ${active ? 'text-wm-text-on-accent' : 'text-wm-text-muted'}`} />
                  )}
                </div>
                <div>
                  <p className={`text-sm ${active ? 'font-semibold text-wm-accent' : completed ? 'text-wm-text-primary' : 'text-wm-text-muted'}`}>{s.label}</p>
                  <p className="font-mono text-[10px] text-wm-text-muted">{s.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right panel — form content */}
      <div className="flex flex-1 flex-col items-center justify-center p-12">
        <div className="w-full max-w-lg">
          {/* Step 0: Domain */}
          {step === 0 && (
            <form onSubmit={handleDomainSubmit} className="flex flex-col gap-6">
              <h2 className="text-2xl font-semibold text-wm-text-primary">Add your domain</h2>
              <p className="font-mono text-xs text-wm-text-tertiary">
                Enter the domain you want to use for email. You&apos;ll need access to your DNS settings to verify ownership.
              </p>

              <div className="flex flex-col gap-2">
                <label className="font-mono text-sm font-medium text-wm-text-secondary">Domain name</label>
                <div className="flex items-center border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
                  <Globe className="mr-3 h-4 w-4 text-wm-text-muted" />
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="example.com"
                    className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

              <Button type="submit" variant="primary" loading={loading} icon={<ArrowRight className="h-4 w-4" />}>
                Continue
              </Button>
            </form>
          )}

          {/* Step 1: DNS */}
          {step === 1 && (
            <div className="flex flex-col gap-6">
              <h2 className="text-2xl font-semibold text-wm-text-primary">Configure DNS records</h2>
              <p className="font-mono text-xs text-wm-text-tertiary">
                Add these records to your DNS provider for <span className="text-wm-accent">{domain}</span>
              </p>

              <div className="flex flex-col border border-wm-border">
                {records.map((record, idx) => {
                  const typeLabel = record.type === 'MX' ? 'MX' : record.name.includes('_domainkey') ? 'DKIM' : record.name.includes('_dmarc') ? 'DMARC' : 'SPF'
                  const typeColor = record.type === 'MX' ? 'text-wm-info' : 'text-wm-warning'
                  const isVerified = dnsStatus ? (
                    typeLabel === 'MX' ? dnsStatus.mx :
                    typeLabel === 'SPF' ? dnsStatus.spf :
                    typeLabel === 'DKIM' ? dnsStatus.dkim :
                    dnsStatus.dmarc
                  ) : false

                  return (
                    <div key={idx} className="flex items-center gap-3 border-b border-wm-border px-4 py-3 last:border-b-0">
                      <span className={`font-mono text-[10px] font-bold ${typeColor}`}>{typeLabel}</span>
                      <div className="flex-1">
                        <p className="font-mono text-xs text-wm-text-primary">{record.name}</p>
                        <p className="truncate font-mono text-[10px] text-wm-text-muted">{record.value}</p>
                      </div>
                      {dnsStatus && (
                        <span className={`font-mono text-[10px] font-semibold ${isVerified ? 'text-wm-accent' : 'text-wm-warning'}`}>
                          {isVerified ? '● OK' : '● Pending'}
                        </span>
                      )}
                      <button
                        onClick={() => copyToClipboard(record.value, idx)}
                        className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
                      >
                        {copiedIdx === idx ? <Check className="h-3.5 w-3.5 text-wm-accent" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )
                })}
              </div>

              {dnsStatus && !dnsStatus.mx && (
                <p className="font-mono text-xs text-wm-warning">
                  MX record not yet detected. DNS changes can take up to 48 hours to propagate.
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep(0)}>Back</Button>
                <Button variant="primary" icon={<RefreshCw className="h-4 w-4" />} loading={verifying} onClick={handleVerifyDns}>Verify DNS</Button>
                {dnsStatus?.mx ? (
                  <Button variant="primary" icon={<ArrowRight className="h-4 w-4" />} onClick={handleDnsContinue}>Continue</Button>
                ) : (
                  <button onClick={handleSkipDns} className="cursor-pointer font-mono text-xs text-wm-text-muted hover:text-wm-text-secondary">
                    Skip for now
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Create Admin Account */}
          {step === 2 && (
            <form onSubmit={handleCreateAccount} className="flex flex-col gap-6">
              <h2 className="text-2xl font-semibold text-wm-text-primary">Create your account</h2>
              <p className="font-mono text-xs text-wm-text-tertiary">
                Set up the admin account for <span className="text-wm-accent">{domain}</span>. This will be your login email.
              </p>

              <div className="flex flex-col gap-2">
                <label className="font-mono text-sm font-medium text-wm-text-secondary">Display name</label>
                <div className="flex items-center border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
                  <User className="mr-3 h-4 w-4 text-wm-text-muted" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your Name"
                    className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-mono text-sm font-medium text-wm-text-secondary">Email address</label>
                <div className="flex items-center border border-wm-border bg-wm-surface focus-within:border-wm-accent">
                  <div className="flex flex-1 items-center px-4 py-3">
                    <Mail className="mr-3 h-4 w-4 text-wm-text-muted" />
                    <input
                      type="text"
                      value={emailLocal}
                      onChange={(e) => setEmailLocal(e.target.value)}
                      placeholder="you"
                      className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
                    />
                  </div>
                  <span className="border-l border-wm-border bg-wm-bg px-4 py-3 font-mono text-sm text-wm-text-muted">
                    @{domain}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-mono text-sm font-medium text-wm-text-secondary">Password</label>
                <div className="flex items-center border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
                  <Lock className="mr-3 h-4 w-4 text-wm-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="cursor-pointer text-wm-text-muted">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex gap-3 font-mono text-[10px]">
                  <span className={passwordChecks.length ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ 8+ chars</span>
                  <span className={passwordChecks.upper ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ Uppercase</span>
                  <span className={passwordChecks.number ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ Number</span>
                </div>
              </div>

              {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

              <div className="flex items-center gap-3">
                <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep(1)}>Back</Button>
                <Button type="submit" variant="primary" loading={loading} icon={<ArrowRight className="h-4 w-4" />}>
                  Create Account
                </Button>
              </div>
            </form>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center bg-wm-accent">
                <CheckCircle2 className="h-8 w-8 text-wm-text-on-accent" />
              </div>
              <h2 className="text-2xl font-semibold text-wm-text-primary">You&apos;re all set!</h2>
              <p className="font-mono text-xs text-wm-text-tertiary">
                Your email infrastructure is ready. Start sending and receiving emails.
              </p>
              <Button variant="primary" icon={<ArrowRight className="h-4 w-4" />} onClick={() => router.push('/inbox')}>
                Go to Inbox
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
