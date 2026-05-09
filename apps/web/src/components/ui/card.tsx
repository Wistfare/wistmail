import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** When true, renders with the inner-content frame (bg #000) used in
   * Pencil's SettingsCard for nested rows. */
  nested?: boolean
  padded?: boolean
}

/**
 * Base surface card. Pencil reference: `Component/SettingsCard` and the
 * generic surfaces used throughout V3 screens — bg #111111, 1px #1A1A1A
 * stroke, no rounded corners.
 */
export function Card({ className, nested, padded = true, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'border',
        nested ? 'border-wm-border bg-wm-bg' : 'border-wm-border bg-wm-surface',
        padded && 'p-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
