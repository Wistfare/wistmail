'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { FloatingCompose, type ComposeData } from './floating-compose'

type ComposeContextType = {
  openCompose: (data?: ComposeData) => void
  closeCompose: () => void
  isOpen: boolean
}

const ComposeContext = createContext<ComposeContextType>({
  openCompose: () => {},
  closeCompose: () => {},
  isOpen: false,
})

export function useCompose() {
  return useContext(ComposeContext)
}

export function ComposeProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [composeData, setComposeData] = useState<ComposeData | undefined>()

  const openCompose = useCallback((data?: ComposeData) => {
    setComposeData(data)
    setIsOpen(true)
  }, [])

  const closeCompose = useCallback(() => {
    setIsOpen(false)
    setComposeData(undefined)
  }, [])

  return (
    <ComposeContext.Provider value={{ openCompose, closeCompose, isOpen }}>
      {children}
      {isOpen && (
        <FloatingCompose
          initialData={composeData}
          onClose={closeCompose}
        />
      )}
    </ComposeContext.Provider>
  )
}
