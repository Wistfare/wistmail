/// Server-side session lookup. Used by Server Components in (app)/* to
/// gate access without a client-side fetch round-trip after hydration.
///
/// We forward the user's wm_session cookie to the API so it sees the
/// same authenticated request the browser would have made. `cache: 'no-store'`
/// keeps Next from caching one user's session across all visitors.

import { cookies } from 'next/headers'

const API_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3001'

export interface SessionUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  setupComplete: boolean
  setupStep: string | null
  role: string
  mfaRequired: boolean
  mfaSetupComplete: boolean
}

export async function getServerSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const session = cookieStore.get('wm_session')
  if (!session) return null

  try {
    const res = await fetch(`${API_URL}/api/v1/auth/session`, {
      headers: { cookie: `wm_session=${session.value}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { user: SessionUser | null }
    return body.user
  } catch {
    return null
  }
}
