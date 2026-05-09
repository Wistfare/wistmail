'use client'

import { usePathname } from 'next/navigation'
import { MessageSquare, Users } from 'lucide-react'
import {
  SidebarShell,
  SidebarSection,
  SidebarNavItem,
  SidebarComposeButton,
} from './sidebar-shell'

export interface ChatSidebarProps {
  user: { name: string; email: string }
  /** Active conversation list (denormalized — fetched by parent). */
  conversations?: Array<{
    id: string
    title: string
    lastMessage?: string
    unread?: number
    isGroup?: boolean
  }>
  onUserMenu?: () => void
}

export function ChatSidebar({ conversations = [] }: ChatSidebarProps) {
  const pathname = usePathname()
  return (
    <SidebarShell
      cta={<SidebarComposeButton href="/chat/new">New chat</SidebarComposeButton>}
    >
      <SidebarSection label="Chats">
        <SidebarNavItem
          href="/chat"
          icon={<MessageSquare className="h-[18px] w-[18px]" />}
          label="All chats"
          active={pathname === '/chat'}
        />
      </SidebarSection>

      {conversations.length > 0 && (
        <SidebarSection label="Recent">
          {conversations.map((c) => (
            <SidebarNavItem
              key={c.id}
              href={`/chat/${c.id}`}
              icon={
                c.isGroup ? (
                  <Users className="h-[18px] w-[18px]" />
                ) : (
                  <MessageSquare className="h-[18px] w-[18px]" />
                )
              }
              label={c.title}
              active={pathname === `/chat/${c.id}`}
              count={c.unread}
            />
          ))}
        </SidebarSection>
      )}
    </SidebarShell>
  )
}
