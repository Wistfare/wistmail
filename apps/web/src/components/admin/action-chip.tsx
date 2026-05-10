'use client'

import { cn } from '@/lib/utils'

/**
 * Audit-log action chip — color-coded by category. Pencil reference:
 * `AdminV3-AuditLog` (`yDvd5`) — chips appear inline in each row
 * between the actor and the target.
 *
 * Categories follow the audit log action prefix:
 *   - auth.*           → blue   (sign-in, sign-out, mfa.*)
 *   - member.*, user.* → green / lime (member added, user.created)
 *   - role.*           → lime
 *   - billing.*, plan.*, topup.* → amber
 *   - danger / member.removed → red
 *
 * The category mapping is intentionally permissive — anything we don't
 * recognise renders as a neutral chip rather than throwing, so
 * unrecognised actions still surface in the audit log.
 */

export type ActionCategory = 'auth' | 'member' | 'role' | 'billing' | 'danger' | 'neutral'

export interface ActionChipProps {
  /** The raw audit-log action string, e.g. `member.role_changed`. */
  action: string
  className?: string
}

const CATEGORY_STYLES: Record<ActionCategory, string> = {
  auth: 'bg-wm-info/15 text-wm-info border-wm-info/30',
  member: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  role: 'bg-wm-accent/15 text-wm-accent border-wm-accent/30',
  billing: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  danger: 'bg-wm-error/15 text-wm-error border-wm-error/30',
  neutral: 'bg-wm-surface text-wm-text-secondary border-wm-border',
}

/**
 * Public — exported for tests and for the audit-log filter pills which
 * render category groupings.
 */
export function categorizeAction(action: string): ActionCategory {
  const lower = action.toLowerCase()
  if (lower === 'member.removed' || lower === 'organization.deleted') return 'danger'
  if (lower.startsWith('auth.') || lower.startsWith('mfa.')) return 'auth'
  if (lower.startsWith('role.') || lower === 'member.role_changed') return 'role'
  if (
    lower.startsWith('billing.') ||
    lower.startsWith('plan.') ||
    lower.startsWith('topup.') ||
    lower.startsWith('wallet.')
  ) {
    return 'billing'
  }
  if (lower.startsWith('member.') || lower.startsWith('user.')) return 'member'
  return 'neutral'
}

export function ActionChip({ action, className }: ActionChipProps) {
  const category = categorizeAction(action)
  const label = action.replace(/_/g, ' ')
  return (
    <span
      data-category={category}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[1px]',
        CATEGORY_STYLES[category],
        className,
      )}
    >
      {label}
    </span>
  )
}
