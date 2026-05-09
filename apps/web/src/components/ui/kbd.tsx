import { cn } from '@/lib/utils'

export interface KbdProps {
  children: React.ReactNode
  className?: string
}

/**
 * Inline keyboard shortcut chip. Pencil reference: shortcut chip inside
 * SearchBar (`Component/SearchBar`), padding [2, 6], 1px #1A1A1A border,
 * JetBrains Mono 11px.
 */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center border border-wm-border px-1.5 py-px font-mono text-[11px] text-wm-text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
