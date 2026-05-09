'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Globe, Server, User } from 'lucide-react'
import { api } from '@/lib/api-client'
import { WizardLayout, type WizardStep } from '@/components/auth'
import { StepDomain } from './_components/step-domain'
import { StepDns } from './_components/step-dns'
import { StepAccount } from './_components/step-account'
import { StepDone } from './_components/step-done'

type DnsRecord = {
  type: string
  name: string
  value: string
  priority?: number
  verified: boolean
}

/// Step descriptors. The Pencil sideBar uses different captions per
/// state — pending shows "VERIFY YOUR DOMAIN", completed shows
/// "COMPLETED · WISTMAIL.COM" — so we generate captions per render
/// using the live `domain` + `records.length` rather than hard-coding.
const STEP_DEFS = [
  { id: 'domain' as const, label: 'Domain', icon: Globe },
  { id: 'dns' as const, label: 'DNS', icon: Server },
  { id: 'account' as const, label: 'Account', icon: User },
  { id: 'done' as const, label: 'Done', icon: Check },
]

/**
 * Setup wizard host. Pencil reference: SetupV3-Domain (`Jon4p`),
 * SetupV3-DNS-Choose (`iYWpV`), SetupV3-DNS-Manual (`CXgQ0`),
 * SetupV3-DNS-Verify (`u5uqW`), SetupV3-Account (`m8JIs`),
 * SetupV3-Done (`Z8tTv`).
 */
export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [domain, setDomain] = useState('')
  const [records, setRecords] = useState<DnsRecord[]>([])

  // Resume any in-progress setup. If the workspace already has users we
  // bounce to inbox so we don't let a second person re-bootstrap.
  useEffect(() => {
    api
      .get<{
        hasSession: boolean
        inProgress: boolean
        step: string | null
        domainId: string | null
      }>('/api/v1/setup/status')
      .then((res) => {
        if (res.hasSession) {
          router.replace('/inbox')
          return
        }
        if (res.inProgress && res.step && res.domainId) {
          const idx = STEP_DEFS.findIndex((s) => s.id === res.step)
          if (idx >= 0) setStep(idx)
          api
            .get<{ name: string; records: DnsRecord[] }>(
              '/api/v1/setup/domain/records',
            )
            .then((r) => {
              setDomain(r.name)
              setRecords(r.records)
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [router])

  /// Build the step list with Pencil's tri-state captions per step:
  ///   pending   → "VERIFY YOUR DOMAIN" / "CONFIGURE DNS RECORDS" / …
  ///   active    → same as pending
  ///   completed → "COMPLETED · WISTMAIL.COM" / "COMPLETED · 4 RECORDS" / …
  const steps: WizardStep[] = useMemo(() => {
    const pendingCaption: Record<(typeof STEP_DEFS)[number]['id'], string> = {
      domain: 'Verify your domain',
      dns: 'Configure DNS records',
      account: 'Create admin account',
      done: 'Setup complete',
    }
    const completedCaption = (id: (typeof STEP_DEFS)[number]['id']): string => {
      switch (id) {
        case 'domain':
          return domain ? `Completed · ${domain.toUpperCase()}` : 'Completed'
        case 'dns':
          return `Completed · ${records.length} record${
            records.length === 1 ? '' : 's'
          }`
        case 'account':
          return 'Completed · admin account ready'
        case 'done':
          return 'Setup complete'
      }
    }
    return STEP_DEFS.map((def, i) => ({
      id: def.id,
      label: def.label,
      icon: def.icon,
      caption: i < step ? completedCaption(def.id) : pendingCaption[def.id],
    }))
  }, [step, domain, records.length])

  return (
    <WizardLayout steps={steps} currentStep={step}>
      {step === 0 && (
        <StepDomain
          onNext={(data) => {
            setDomain(data.domain)
            setRecords(data.records)
            setStep(1)
          }}
        />
      )}

      {step === 1 && (
        <StepDns domain={domain} records={records} onNext={() => setStep(2)} />
      )}

      {step === 2 && <StepAccount domain={domain} onNext={() => setStep(3)} />}

      {step === 3 && <StepDone domain={domain} />}
    </WizardLayout>
  )
}
