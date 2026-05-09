'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Globe, Server, User } from 'lucide-react'
import { api } from '@/lib/api-client'
import { WizardLayout } from '@/components/auth'
import { StepDomain } from './_components/step-domain'
import { StepDns } from './_components/step-dns'
import { StepAccount } from './_components/step-account'
import { StepDone } from './_components/step-done'

type DnsRecord = { type: string; name: string; value: string; priority?: number; verified: boolean }

const STEPS = [
  { id: 'domain', label: 'Domain', desc: 'Verify your domain', icon: Globe },
  { id: 'dns', label: 'DNS', desc: 'Configure DNS records', icon: Server },
  { id: 'account', label: 'Account', desc: 'Create admin account', icon: User },
  { id: 'done', label: 'Done', desc: 'Setup complete', icon: CheckCircle2 },
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
          const idx = STEPS.findIndex((s) => s.id === res.step)
          if (idx >= 0) setStep(idx)
          api
            .get<{ name: string; records: DnsRecord[] }>('/api/v1/setup/domain/records')
            .then((r) => {
              setDomain(r.name)
              setRecords(r.records)
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [router])

  return (
    <WizardLayout steps={STEPS} currentStep={step}>
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
        <StepDns
          domain={domain}
          records={records}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && <StepAccount domain={domain} onNext={() => setStep(3)} />}

      {step === 3 && <StepDone domain={domain} />}
    </WizardLayout>
  )
}
