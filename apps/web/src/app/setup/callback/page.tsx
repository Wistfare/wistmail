'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'

function CallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const params = Object.fromEntries(searchParams.entries())

    if (params.error) {
      setStatus('error')
      setErrorMsg(
        params.error === 'access_denied'
          ? 'You denied the authorization request. DNS records were not created.'
          : `Authorization failed: ${params.error}`,
      )
      return
    }

    const query = new URLSearchParams(params).toString()
    api
      .get<{ success: boolean; error?: string }>(`/api/v1/setup/domain-connect/callback?${query}`)
      .then((res) => {
        if (res.success) {
          setStatus('success')
          setTimeout(() => router.replace('/setup'), 2000)
        } else {
          setStatus('error')
          setErrorMsg(res.error || 'Something went wrong')
        }
      })
      .catch(() => {
        setStatus('error')
        setErrorMsg('Failed to verify authorization')
      })
  }, [searchParams, router])

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {status === 'loading' && (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-wm-accent" />
          <h2 className="text-xl font-semibold text-wm-text-primary">Completing DNS setup...</h2>
          <p className="font-mono text-xs text-wm-text-muted">Verifying Cloudflare authorization</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="flex h-16 w-16 items-center justify-center bg-wm-accent">
            <CheckCircle2 className="h-8 w-8 text-wm-text-on-accent" />
          </div>
          <h2 className="text-xl font-semibold text-wm-text-primary">DNS records configured!</h2>
          <p className="font-mono text-xs text-wm-text-muted">Redirecting to continue setup...</p>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="flex h-16 w-16 items-center justify-center border border-wm-error">
            <XCircle className="h-8 w-8 text-wm-error" />
          </div>
          <h2 className="text-xl font-semibold text-wm-text-primary">Authorization failed</h2>
          <p className="font-mono text-xs text-wm-error">{errorMsg}</p>
          <Button variant="primary" onClick={() => router.replace('/setup')}>
            Back to Setup
          </Button>
        </>
      )}
    </div>
  )
}

export default function DomainConnectCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-wm-bg">
      <Suspense
        fallback={
          <div className="flex flex-col items-center gap-6">
            <Loader2 className="h-12 w-12 animate-spin text-wm-accent" />
            <p className="font-mono text-xs text-wm-text-muted">Loading...</p>
          </div>
        }
      >
        <CallbackContent />
      </Suspense>
    </div>
  )
}
