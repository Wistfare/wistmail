import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Convenience: number of stacked rows. Defaults to a single block. */
  rows?: number
}

/**
 * Loading shimmer placeholder. Uses the `--animate-shimmer` keyframe
 * defined in globals.css. No rounded corners — matches the V3 sharp-edged
 * surfaces.
 */
export function Skeleton({ className, rows, ...props }: SkeletonProps) {
  if (rows && rows > 1) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBlock key={i} className={className} {...props} />
        ))}
      </div>
    )
  }
  return <SkeletonBlock className={className} {...props} />
}

function SkeletonBlock({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'relative h-3 w-full overflow-hidden bg-wm-surface',
        className,
      )}
      {...props}
    >
      <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  )
}
