'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Sidebar primitives.
 *
 * Pencil reference: `Component/SidebarV2.detailPanel` (`DW82K`).
 * - 240–260px wide, bg #111111, padding [16, 12], gap 6 vertical
 * - 1px right border #1A1A1A
 * - Section header: Inter 10px 600 letter-spaced 2px #404040, padding [16, 0, 6, 4]
 * - NavItem: padding [10, 12], gap 10, JetBrains Mono 13px
 *   - active: 2px left lime stroke + accent-dim bg + lime icon/text
 *   - inactive: #6E6E6E icon + text, count text 11px #404040
 *   - active badge: bg lime, text black, JetBrains Mono 10px 700, padding [2,8]
 * - LabelItem: 6×6 colored square + JetBrains Mono 11px text #999, padding [6, 12], gap 8
 * - UserSection: bottom 28×28 round avatar + name (Inter 12px 600) + email
 *   (JetBrains Mono 9px #6E6E6E), padding [10, 8], cornerRadius 6, bg #1A1A1A
 */

export interface SidebarShellProps {
  /** Optional CTA at the top of the sidebar (e.g. Compose, New chat). */
  cta?: React.ReactNode
  children: React.ReactNode
  /** Optional bottom section (typically <SidebarUser />). */
  footer?: React.ReactNode
  className?: string
  /** Width override. Defaults to 240px (matches V3 Mail/Chat sidebars). */
  width?: 'sm' | 'md' | 'lg'
}

const widthClass = {
  sm: 'w-56',
  md: 'w-60',
  lg: 'w-72',
}

export function SidebarShell({ cta, children, footer, className, width = 'md' }: SidebarShellProps) {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-wm-border bg-wm-surface',
        widthClass[width],
        className,
      )}
    >
      {cta && <div className="px-3 pt-4">{cta}</div>}
      <div className="flex flex-1 flex-col overflow-y-auto px-3 pb-3 pt-2">{children}</div>
      {footer && <div className="px-3 pb-3">{footer}</div>}
    </aside>
  )
}

export interface SidebarSectionProps {
  label?: string
  children: React.ReactNode
  /** Optional adornment on the right of the section label (e.g. + icon to add). */
  adornment?: React.ReactNode
  className?: string
}

/** Header + body group inside SidebarShell. */
export function SidebarSection({ label, children, adornment, className }: SidebarSectionProps) {
  return (
    <div className={cn('flex flex-col gap-0.5 pt-3', className)}>
      {label && (
        <div className="flex items-center justify-between px-2 pb-1.5 pt-2">
          <span className="font-sans text-[10px] font-semibold uppercase tracking-[2px] text-wm-text-muted">
            {label}
          </span>
          {adornment}
        </div>
      )}
      {children}
    </div>
  )
}

export interface SidebarNavItemProps {
  href: string
  icon?: React.ReactNode
  label: React.ReactNode
  active?: boolean
  /** Trailing count (rendered as a chip when active, dim text when inactive). */
  count?: number | string
  className?: string
  onClick?: () => void
}

/** NavItem matching Pencil's NavItem / NavItemActive. */
export function SidebarNavItem({
  href,
  icon,
  label,
  active,
  count,
  className,
  onClick,
}: SidebarNavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-2.5 px-3 py-2.5 font-mono text-[13px] transition-colors',
        active
          ? 'border-l-2 border-wm-accent bg-wm-accent-dim text-wm-accent'
          : 'border-l-2 border-transparent text-wm-text-tertiary hover:bg-wm-surface-hover hover:text-wm-text-secondary',
        className,
      )}
    >
      {icon && (
        <span className={cn('flex h-[18px] w-[18px] items-center justify-center')} aria-hidden>
          {icon}
        </span>
      )}
      <span className={cn('flex-1 truncate', active && 'font-medium')}>{label}</span>
      {count !== undefined && count !== 0 && count !== '' && (
        <span
          className={cn(
            'inline-flex min-w-[20px] items-center justify-center px-2 py-px font-mono text-[10px] font-bold',
            active ? 'bg-wm-accent text-wm-text-on-accent' : 'text-wm-text-muted',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  )
}

export interface SidebarLabelItemProps {
  href: string
  color: string
  name: string
  active?: boolean
  count?: number | string
}

/** Colored-dot label entry — Pencil labelPrimary/Updates/Promotions/Newsletters. */
export function SidebarLabelItem({ href, color, name, active, count }: SidebarLabelItemProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 px-3 py-1.5 font-mono text-[11px] transition-colors',
        active
          ? 'bg-wm-surface-hover text-wm-text-primary'
          : 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
      )}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 truncate">{name}</span>
      {count !== undefined && count !== 0 && count !== '' && (
        <span className="font-mono text-[11px] text-wm-text-muted">{count}</span>
      )}
    </Link>
  )
}

export interface SidebarComposeButtonProps {
  onClick?: () => void
  href?: string
  icon?: React.ReactNode
  children: React.ReactNode
}

/** Primary CTA at top of a sidebar (Compose / New chat / New event). */
export function SidebarComposeButton({
  onClick,
  href,
  icon = <Plus className="h-4 w-4" />,
  children,
}: SidebarComposeButtonProps) {
  const cls =
    'flex w-full cursor-pointer items-center justify-center gap-2 bg-wm-accent px-4 py-2.5 font-mono text-[13px] font-semibold text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover'
  if (href) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {children}
    </button>
  )
}

export interface SidebarUserProps {
  name: string
  email: string
  avatarUrl?: string | null
  onClick?: () => void
}

/** Bottom user pill inside the sidebar — clickable to open the user menu. */
export function SidebarUser({ name, email, onClick }: SidebarUserProps) {
  const initial = name.trim()[0]?.toUpperCase() ?? 'U'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 bg-wm-surface-hover px-2 py-2 text-left transition-colors hover:bg-wm-border"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-wm-accent font-sans text-[11px] font-semibold text-wm-text-on-accent">
        {initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-sans text-xs font-semibold text-wm-text-primary">
          {name}
        </span>
        <span className="truncate font-mono text-[9px] text-wm-text-tertiary">{email}</span>
      </span>
    </button>
  )
}
