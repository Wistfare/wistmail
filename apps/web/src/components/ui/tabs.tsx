'use client'

import { createContext, useContext, useId, useMemo } from 'react'
import { cn } from '@/lib/utils'

interface TabsCtx {
  value: string
  setValue: (v: string) => void
  id: string
}
const Ctx = createContext<TabsCtx | null>(null)

function useTabs(): TabsCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('Tabs.* must be used inside <Tabs>')
  return v
}

export interface TabsProps {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  className?: string
}

/**
 * Underline tabs. Pencil reference: appears in InboxV3 ("All / Mail /
 * Chat"), AdminV3-Overview ("All / Active / Disabled"), MeetingsV3
 * ("Upcoming / Recent / All"). Active tab gets lime underline + white
 * text; inactive tabs are #999.
 */
export function Tabs({ value, onChange, children, className }: TabsProps) {
  const id = useId()
  const ctx = useMemo<TabsCtx>(() => ({ value, setValue: onChange, id }), [value, onChange, id])
  return (
    <Ctx.Provider value={ctx}>
      <div className={cn('flex items-center gap-1', className)}>{children}</div>
    </Ctx.Provider>
  )
}

export interface TabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
  count?: number
}

function Tab({ value, count, children, className, ...props }: TabProps) {
  const ctx = useTabs()
  const active = ctx.value === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.setValue(value)}
      className={cn(
        'relative cursor-pointer px-3 py-2 font-mono text-xs transition-colors',
        active ? 'text-wm-text-primary' : 'text-wm-text-secondary hover:text-wm-text-primary',
        className,
      )}
      {...props}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {typeof count === 'number' && (
          <span
            className={cn(
              'inline-flex min-w-[18px] justify-center px-1 py-px font-mono text-[10px]',
              active ? 'bg-wm-accent text-wm-text-on-accent' : 'bg-wm-surface-hover text-wm-text-secondary',
            )}
          >
            {count}
          </span>
        )}
      </span>
      {active && <span className="absolute inset-x-0 -bottom-px h-px bg-wm-accent" />}
    </button>
  )
}

Tabs.Tab = Tab
