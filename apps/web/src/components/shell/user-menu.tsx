'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, Settings, ShieldCheck } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { api } from '@/lib/api-client'

export interface UserMenuPanelProps {
  user: { name: string; email: string; avatarUrl?: string | null; role?: string }
  onClose: () => void
}

/** Floating panel anchored to a button — used by IconRail avatar / SidebarUser. */
export function UserMenuPanel({ user, onClose }: UserMenuPanelProps) {
  const router = useRouter()
  const isAdmin = user.role === 'owner' || user.role === 'admin'

  async function logout() {
    try {
      await api.post('/api/v1/auth/logout')
    } catch {
      // best effort — still navigate to login
    }
    onClose()
    router.push('/login')
  }

  return (
    <div className="border border-wm-border bg-wm-surface shadow-2xl">
      <div className="flex items-center gap-3 border-b border-wm-border px-4 py-3">
        <Avatar name={user.name} src={user.avatarUrl ?? undefined} size="md" />
        <div className="flex min-w-0 flex-col">
          <p className="truncate font-sans text-sm font-medium text-wm-text-primary">
            {user.name}
          </p>
          <p className="truncate font-mono text-[10px] text-wm-text-muted">{user.email}</p>
        </div>
      </div>
      <div className="flex flex-col py-1">
        <Link
          href="/settings/account"
          onClick={onClose}
          className="flex cursor-pointer items-center gap-2.5 px-4 py-2 font-mono text-xs text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
        >
          <Settings className="h-3.5 w-3.5" />
          Account settings
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            onClick={onClose}
            className="flex cursor-pointer items-center gap-2.5 px-4 py-2 font-mono text-xs text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-wm-accent" />
            Admin panel
          </Link>
        )}
      </div>
      <div className="border-t border-wm-border py-1">
        <button
          type="button"
          onClick={logout}
          className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 font-mono text-xs text-wm-error transition-colors hover:bg-wm-error/10"
        >
          <LogOut className="h-3.5 w-3.5" />
          Log out
        </button>
      </div>
    </div>
  )
}
