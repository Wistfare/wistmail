'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

export interface BarChartDatum {
  /** ISO date string `YYYY-MM-DD`. */
  date: string
  /** Bar height value. */
  count: number
}

export interface BarChartProps {
  data: BarChartDatum[]
  /** Optional accessible title. */
  ariaLabel?: string
  /**
   * The bar to highlight in lime. Defaults to the tallest bar so the
   * "winning day" pops without forcing the caller to compute it.
   */
  highlightIndex?: number
  /** Optional className for the wrapping <svg>. */
  className?: string
  /**
   * Total chart height in pixels. Width is responsive — the SVG uses
   * a `viewBox` so it scales with the parent.
   */
  height?: number
}

/**
 * Lightweight SVG bar chart. Match the Pencil's lime + dimmed bars
 * (cf. `boHfA`/`m7EUl` overview frames). Importing recharts/echarts
 * pulls in 100KB+ of code we don't need for a single bar series, so
 * we render the SVG by hand. The viewBox is `100 x height` and bars
 * fill the width proportionally regardless of how many points are
 * passed in.
 */
export function BarChart({
  data,
  ariaLabel = 'Daily activity',
  highlightIndex,
  className,
  height = 96,
}: BarChartProps) {
  const titleId = useId()
  const max = Math.max(1, ...data.map((d) => d.count))
  // Default highlight = tallest bar; ties broken by the latest one.
  const computedHighlight =
    highlightIndex ??
    data.reduce(
      (acc, d, i) => (d.count >= max && d.count > 0 ? i : acc),
      -1,
    )

  // Geometry — viewBox is fixed at 100 wide so we can use percentages
  // for each bar; SVG scales to fit the parent.
  const VIEWBOX_WIDTH = 100
  const slot = data.length > 0 ? VIEWBOX_WIDTH / data.length : VIEWBOX_WIDTH
  // Bar takes 60% of its slot, centred — leaves visual breathing room.
  const barWidth = slot * 0.6
  const barOffset = (slot - barWidth) / 2

  return (
    <svg
      role="img"
      aria-labelledby={titleId}
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
    >
      <title id={titleId}>{ariaLabel}</title>
      {data.map((d, i) => {
        const ratio = d.count / max
        const barHeight = Math.max(2, ratio * (height - 6))
        const x = i * slot + barOffset
        const y = height - barHeight
        const active = i === computedHighlight
        return (
          <rect
            key={d.date}
            data-testid="bar-chart-bar"
            data-active={active ? 'true' : 'false'}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={1}
            ry={1}
            fill={active ? 'var(--color-wm-accent)' : 'var(--color-wm-border)'}
            opacity={active ? 1 : 0.7}
          >
            <title>
              {d.date}: {d.count}
            </title>
          </rect>
        )
      })}
    </svg>
  )
}
