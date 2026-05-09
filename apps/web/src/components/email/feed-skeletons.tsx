'use client'

import { Shimmer, ShimmerCircle, ShimmerLine } from '@/components/ui/shimmer'

/**
 * Inbox feed-row skeleton — mirrors `EmailRowV3` geometry exactly so
 * the placeholder slots into the same row height with no jitter when
 * data lands.
 *
 *   container : padding [12, 20], gap 12, alignItems start, 3-px
 *               LEFT border (transparent in the skeleton case so the
 *               row doesn't shift when an active row arrives).
 *   avatar    : 40×40 round.
 *   col       : header (display name + tag chip + time) + subject +
 *               snippet. We render pixels-correct vertical gaps so
 *               the loader takes the same vertical real estate as a
 *               filled row.
 */
export function EmailRowSkeleton() {
  return (
    <div
      className="flex w-full items-start"
      style={{
        padding: '12px 20px',
        gap: 12,
        borderLeft: '3px solid transparent',
      }}
    >
      <ShimmerCircle size={40} />
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 3 }}>
        <span className="flex w-full items-center justify-between" style={{ gap: 8 }}>
          <span className="flex items-center" style={{ gap: 6 }}>
            <ShimmerLine width={92} height={12} />
            <Shimmer width={32} height={12} radius={4} />
          </span>
          <ShimmerLine width={32} height={9} />
        </span>
        <ShimmerLine width="78%" height={12} />
        <ShimmerLine width="92%" height={11} />
      </span>
    </div>
  )
}

/// Stack of N feed rows wrapped under a faux section header so the
/// loader looks exactly like a populated inbox column.
export function FeedListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex w-full flex-col">
      <SectionHeaderSkeleton />
      {Array.from({ length: rows }).map((_, i) => (
        <EmailRowSkeleton key={i} />
      ))}
    </div>
  )
}

/// "TODAY · N" section divider placeholder. Pencil `Uc2Th`: padding
/// [10, 20, 8, 20], horizontal layout, fill #000000.
export function SectionHeaderSkeleton() {
  return (
    <div
      className="flex w-full items-center justify-between"
      style={{ padding: '10px 20px 8px 20px', background: '#000000' }}
    >
      <ShimmerLine width={56} height={9} />
      <ShimmerLine width={20} height={9} />
    </div>
  )
}

/// Right-pane placeholder when an email is selected but the detail
/// query is still resolving — mirrors the toolbar + subject row +
/// sender row + a few body lines so the column doesn't collapse.
export function EmailReadingSkeleton() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* toolbar — breadcrumb + 5 round buttons */}
      <div
        className="flex w-full items-center justify-between"
        style={{
          padding: '16px 28px',
          borderBottom: '1px solid var(--color-wm-border)',
        }}
      >
        <ShimmerLine width={220} height={10} />
        <span className="flex items-center" style={{ gap: 6 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Shimmer key={i} width={32} height={32} radius={8} />
          ))}
        </span>
      </div>

      {/* subject + sender row */}
      <div
        className="flex flex-col"
        style={{ gap: 18, padding: '24px 28px 0 28px' }}
      >
        <div className="flex flex-col" style={{ gap: 6 }}>
          <ShimmerLine width={140} height={9} />
          <Shimmer width="86%" height={28} radius={6} />
        </div>
        <div className="flex w-full items-center" style={{ gap: 12 }}>
          <ShimmerCircle size={44} />
          <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 4 }}>
            <ShimmerLine width={120} height={13} />
            <ShimmerLine width="60%" height={11} />
          </span>
          <Shimmer width={92} height={36} radius={18} />
          <Shimmer width={36} height={36} radius={18} />
          <Shimmer width={36} height={36} radius={18} />
        </div>
      </div>

      {/* body */}
      <div
        className="flex flex-col"
        style={{ gap: 12, padding: '20px 28px 32px 28px' }}
      >
        <ShimmerLine width="92%" height={14} />
        <ShimmerLine width="88%" height={14} />
        <ShimmerLine width="76%" height={14} />
        <ShimmerLine width="94%" height={14} />
        <ShimmerLine width="64%" height={14} />
      </div>
    </div>
  )
}
