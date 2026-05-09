'use client'

import { cn } from '@/lib/utils'

/**
 * Base shimmer block.  Renders a placeholder shape (rounded rect or
 * circle) with a sweeping lime-tinted highlight across a dark
 * surface-coloured base — matches the wm-bg / wm-surface palette so
 * the loading state slots into any V3 chrome cleanly.
 *
 * The animation keyframe (`shimmer`) is defined globally in
 * `app/globals.css`; we just position the highlight gradient and let
 * the keyframe sweep its `translateX`.
 *
 * Usage:
 *   <Shimmer width={120} height={14} radius={4} />
 *   <Shimmer width={40} height={40} circle />
 *
 * For higher-level layouts (rows, bubbles, conversation cards) build
 * skeleton components that compose multiple <Shimmer/> primitives —
 * see `chat-skeletons.tsx` and `feed-skeletons.tsx`.
 */
export interface ShimmerProps {
  width?: number | string
  height?: number | string
  /** Border-radius in px. Ignored when `circle` is true. */
  radius?: number
  /** Render a perfect circle (uses `width` for both dimensions). */
  circle?: boolean
  /** Optional className passthrough for layout (margin, flex). */
  className?: string
  /** Override the base swatch — defaults to wm-surface. */
  tone?: 'surface' | 'sunken'
}

export function Shimmer({
  width = '100%',
  height = 12,
  radius = 4,
  circle,
  className,
  tone = 'surface',
}: ShimmerProps) {
  const dimension = circle
    ? typeof width === 'number'
      ? width
      : 32
    : undefined
  return (
    <span
      aria-hidden
      className={cn('relative block overflow-hidden', className)}
      style={{
        width: circle ? dimension : width,
        height: circle ? dimension : height,
        borderRadius: circle ? '50%' : radius,
        background: tone === 'sunken' ? '#0A0A0A' : '#1A1A1A',
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          // Sweeping highlight — a soft lime/white band that moves
          // left-to-right via the global `shimmer` keyframe. Low
          // alpha so the effect reads as a subtle pulse, not noise.
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 40%, rgba(191,255,0,0.08) 50%, rgba(255,255,255,0.05) 60%, transparent 100%)',
          animation: 'var(--animate-shimmer)',
        }}
      />
    </span>
  )
}

/**
 * Convenience — a horizontal line of variable width.  Perfect for
 * single-line text placeholders (names, snippets, timestamps).
 */
export function ShimmerLine({
  width = '60%',
  height = 12,
  className,
}: {
  width?: number | string
  height?: number
  className?: string
}) {
  return <Shimmer width={width} height={height} radius={4} className={className} />
}

/** Convenience — circular placeholder (avatar). */
export function ShimmerCircle({
  size = 32,
  className,
}: {
  size?: number
  className?: string
}) {
  return <Shimmer width={size} height={size} circle className={className} />
}

/**
 * Vertical-stack of N rows, each a thin shimmer line.  Width tapers
 * a little on the last row so the placeholder reads as a paragraph
 * rather than a uniform stripe.
 */
export function ShimmerLines({
  rows = 2,
  height = 11,
  gap = 6,
  className,
}: {
  rows?: number
  height?: number
  gap?: number
  className?: string
}) {
  const widths = ['96%', '88%', '76%', '64%']
  return (
    <span className={cn('flex flex-col', className)} style={{ gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <ShimmerLine
          key={i}
          width={widths[i % widths.length] ?? '80%'}
          height={height}
        />
      ))}
    </span>
  )
}
