'use client'

import { useState, useCallback } from 'react'

export function useWizard<T extends Record<string, unknown>>(totalSteps: number) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<Partial<T>>({})
  const [loading, setLoading] = useState(false)

  const next = useCallback(() => {
    setStep((s) => Math.min(s + 1, totalSteps - 1))
  }, [totalSteps])

  const back = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0))
  }, [])

  const updateData = useCallback((partial: Partial<T>) => {
    setData((prev) => ({ ...prev, ...partial }))
  }, [])

  return {
    step,
    setStep,
    data,
    updateData,
    loading,
    setLoading,
    next,
    back,
    isFirst: step === 0,
    isLast: step === totalSteps - 1,
    totalSteps,
  }
}
