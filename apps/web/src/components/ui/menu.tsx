'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface MenuCtx {
  open: boolean
  setOpen: (v: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  align: 'start' | 'end'
  side: 'bottom' | 'top'
}

const Ctx = createContext<MenuCtx | null>(null)

function useMenu(): MenuCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('Menu.* must be used inside <Menu>')
  return v
}

export interface MenuProps {
  children: React.ReactNode
  align?: 'start' | 'end'
  side?: 'bottom' | 'top'
}

/** Headless dropdown menu. Compose with Menu.Trigger / Menu.Items / Menu.Item. */
export function Menu({ children, align = 'start', side = 'bottom' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const value = useMemo<MenuCtx>(() => ({ open, setOpen, triggerRef, align, side }), [open, align, side])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export type MenuTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement>

function Trigger({ children, onClick, ...props }: MenuTriggerProps) {
  const { open, setOpen, triggerRef } = useMenu()
  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) setOpen(!open)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export interface MenuItemsProps {
  children: React.ReactNode
  className?: string
}

function Items({ children, className }: MenuItemsProps) {
  const { open, setOpen, triggerRef, align, side } = useMenu()
  const itemsRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      const t = e.target as Node
      if (itemsRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, setOpen, triggerRef])

  if (!open) return null

  const alignClass = align === 'end' ? 'right-0' : 'left-0'
  const sideClass = side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'

  return (
    <div
      ref={itemsRef}
      role="menu"
      className={cn(
        'absolute z-50 min-w-[180px] border border-wm-border bg-wm-surface py-1 shadow-2xl',
        alignClass,
        sideClass,
        className,
      )}
    >
      {children}
    </div>
  )
}

export interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  destructive?: boolean
  icon?: React.ReactNode
  shortcut?: string
}

function Item({ destructive, icon, shortcut, children, onClick, className, ...props }: MenuItemProps) {
  const { setOpen } = useMenu()
  return (
    <button
      role="menuitem"
      type="button"
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) setOpen(false)
      }}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 font-mono text-xs transition-colors',
        destructive
          ? 'text-wm-error hover:bg-wm-error/10'
          : 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {icon && <span className="text-current">{icon}</span>}
      <span className="flex-1 text-left">{children}</span>
      {shortcut && (
        <span className="font-mono text-[10px] text-wm-text-muted">{shortcut}</span>
      )}
    </button>
  )
}

function Separator() {
  return <div className="my-1 h-px bg-wm-border" role="separator" />
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-wm-text-muted">
      {children}
    </div>
  )
}

/**
 * Hook to imperatively close the menu (rare; the default item click closes
 * automatically). Useful for menus with custom interactive children.
 */
export function useMenuActions() {
  const { setOpen } = useMenu()
  return useMemo(
    () => ({
      close: () => setOpen(false),
      open: () => setOpen(true),
    }),
    [setOpen],
  )
}

Menu.Trigger = Trigger
Menu.Items = Items
Menu.Item = Item
Menu.Separator = Separator
Menu.Label = Label
