'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Server, User, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { ProgressSidebar } from './_components/progress-sidebar'
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

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)

  // Shared state across steps
  const [domain, setDomain] = useState('')
  const [records, setRecords] = useState<DnsRecord[]>([])

  // Check if setup is already in progress (resume)
  useEffect(() => {
    api
      .get<{ hasUsers: boolean; inProgress: boolean; step: string | null; domainId: string | null }>(
        '/api/v1/setup/status',
      )
      .then((res) => {
        if (res.hasUsers) {
          router.replace('/login')
          return
        }
        if (res.inProgress && res.step && res.domainId) {
          const stepIdx = STEPS.findIndex((s) => s.id === res.step)
          if (stepIdx >= 0) setStep(stepIdx)
          // Fetch domain records to restore state
          api
            .get<{ name: string; records: DnsRecord[]; mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean }>(
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

  return (
    <div className="flex min-h-screen bg-wm-bg">
      <ProgressSidebar steps={STEPS} currentStep={step} />

      <div className="flex flex-1 flex-col items-center justify-center p-12">
        <div className="w-full max-w-lg">
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

          {step === 2 && (
            <StepAccount
              domain={domain}
              onNext={() => setStep(3)}
            />
          )}

          {step === 3 && <StepDone />}
        </div>
      </div>
    </div>
  )
}
