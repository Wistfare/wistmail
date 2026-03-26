'use client'

import { useState, useCallback, useEffect } from 'react'
import { api } from '@/lib/api-client'

const STEP_NAMES = ['domain', 'dns', 'mailbox', 'done'] as const

export function useWizard<T extends Record<string, unknown>>(totalSteps: number) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<Partial<T>>({})
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Restore step from server on mount
  useEffect(() => {
    api
      .get<{ user: { setupStep: string } | null }>('/api/v1/auth/session')
      .then((res) => {
        if (res.user?.setupStep) {
          const idx = STEP_NAMES.indexOf(res.user.setupStep as typeof STEP_NAMES[number])
          if (idx >= 0) setStep(idx)
        }
      })
      .catch(() => {})
      .finally(() => setInitialized(true))
  }, [])

  // Persist step to server whenever it changes
  const persistStep = useCallback((stepIdx: number) => {
    const stepName = STEP_NAMES[stepIdx] || 'domain'
    api.patch('/api/v1/setup/step', { step: stepName }).catch(() => {})
  }, [])

  const next = useCallback(() => {
    setStep((s) => {
      const newStep = Math.min(s + 1, totalSteps - 1)
      persistStep(newStep)
      return newStep
    })
  }, [totalSteps, persistStep])

  const back = useCallback(() => {
    setStep((s) => {
      const newStep = Math.max(s - 1, 0)
      persistStep(newStep)
      return newStep
    })
  }, [persistStep])

  const goTo = useCallback((s: number) => {
    setStep(s)
    persistStep(s)
  }, [persistStep])

  const updateData = useCallback((partial: Partial<T>) => {
    setData((prev) => ({ ...prev, ...partial }))
  }, [])

  return {
    step,
    setStep: goTo,
    data,
    updateData,
    loading,
    setLoading,
    next,
    back,
    isFirst: step === 0,
    isLast: step === totalSteps - 1,
    totalSteps,
    initialized,
  }
}
