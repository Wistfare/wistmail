'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SettingsTopBar } from '@/components/shell'
import {
  TopupForm,
  WalletCard,
  type TopupFormSubmitInput,
} from '@/components/billing'
import { api } from '@/lib/api-client'

interface WalletResponse {
  data: { balanceCents: number; currency: string }
}

interface TopupResponse {
  data: {
    id: string
    status: string
    providerCollectionId: string
    providerStatus: string
  }
}

/**
 * `/admin/billing/topup` — Pencil reference: `Top up wallet` drawer
 * (`W2Hdlo`). The drawer is a side panel in the design; the dedicated page
 * is the same form rendered as a two-column layout (current wallet on the
 * left, form on the right) so admins can confirm balance while topping up.
 */
export default function AdminBillingTopupPage() {
  const router = useRouter()
  const [wallet, setWallet] = useState<WalletResponse['data'] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<WalletResponse>('/api/v1/billing/wallet')
      .then((res) => {
        if (!cancelled) setWallet(res.data)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (input: TopupFormSubmitInput) => {
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await api.post<TopupResponse>(
        '/api/v1/billing/topup',
        input,
      )
      setSuccess(
        `Top-up requested — confirm on your phone (${res.data.providerCollectionId.slice(0, 16)}…).`,
      )
      setTimeout(() => {
        router.push('/admin/billing')
      }, 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Top-up failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ background: '#000000' }}>
      <SettingsTopBar scope="Admin / Billing" page="Top up" />
      <div
        className="flex flex-col overflow-y-auto"
        style={{ gap: 24, padding: '28px 32px' }}
      >
        <div className="flex flex-col" style={{ gap: 6 }}>
          <h1
            className="font-mono font-bold text-wm-text-primary"
            style={{ fontSize: 30 }}
          >
            Top up wallet
          </h1>
          <p
            className="font-mono"
            style={{ fontSize: 12, color: '#6e6e6e' }}
          >
            Confirm the USSD push on your phone — funds land in the wallet as
            soon as Wistfare confirms the collection.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="flex flex-col gap-3">
            <WalletCard
              balanceCents={wallet?.balanceCents ?? 0}
              currency={wallet?.currency ?? 'USD'}
            />
            {success && (
              <div className="border border-wm-accent bg-wm-accent-dim px-4 py-3 font-mono text-[12px] text-wm-accent">
                {success}
              </div>
            )}
          </div>
          <div className="border border-wm-border bg-wm-surface p-6">
            <TopupForm
              onSubmit={submit}
              submitting={submitting}
              error={error}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
