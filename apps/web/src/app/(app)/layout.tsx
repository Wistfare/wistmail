import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { AppShell } from '@/components/shell'
import { ComposeProvider } from '@/components/email/compose-provider'
import { QueryProvider } from '@/components/providers/query-provider'
import { ToastProvider } from '@/components/ui/toast'
import { getServerSession } from '@/lib/server-session'
import { SessionUserProvider } from '@/lib/session-user-context'
import { ChatRealtimeBridge } from '@/lib/chat-realtime-bridge'
import { TypingBusProvider } from '@/lib/typing-bus'

/// Server-rendered shell. Auth + setup gating happens before the client
/// even hydrates — no flash of "loading" state, no client refetch on every
/// navigation. The user is forwarded as props to the (client) Sidebar.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerSession()
  if (!user) {
    redirect('/login')
  }

  // We can't read the URL pathname from a Server Component synchronously,
  // but the middleware-style check (`x-pathname` header set by middleware)
  // gives us enough to skip the setup redirect on /setup itself.
  const headerList = await headers()
  const pathname = headerList.get('x-pathname') ?? ''
  if (!user.setupComplete && !pathname.startsWith('/setup')) {
    redirect('/setup')
  }

  if (pathname.startsWith('/setup')) {
    return <>{children}</>
  }

  return (
    <QueryProvider>
      <ToastProvider>
        <SessionUserProvider
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl ?? null,
          }}
        >
          <ComposeProvider>
            <TypingBusProvider>
              <ChatRealtimeBridge />
              <AppShell
                user={{
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  avatarUrl: user.avatarUrl ?? null,
                  role: user.role,
                }}
              >
                {children}
              </AppShell>
            </TypingBusProvider>
          </ComposeProvider>
        </SessionUserProvider>
      </ToastProvider>
    </QueryProvider>
  )
}
