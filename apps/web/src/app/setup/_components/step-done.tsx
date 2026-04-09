'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function StepDone() {
  const router = useRouter()

  return (
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
  )
}
