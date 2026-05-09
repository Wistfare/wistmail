import { cn } from '@/lib/utils'

/** "──── OR ────" divider used on LoginV3 between password sign-in and SSO. */
export function AuthDivider({ label = 'OR', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="h-px flex-1 bg-wm-border" aria-hidden />
      <span className="font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
        {label}
      </span>
      <span className="h-px flex-1 bg-wm-border" aria-hidden />
    </div>
  )
}
