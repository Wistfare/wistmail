import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Sidebar } from '@/components/layout/sidebar'
import { ComposeProvider } from '@/components/email/compose-provider'
import { getServerSession } from '@/lib/server-session'

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
    <ComposeProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          user={{
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl ?? undefined,
            role: user.role,
          }}
          activeRoute={pathname}
          unreadCounts={{ inbox: 0 }}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </ComposeProvider>
  )
}
