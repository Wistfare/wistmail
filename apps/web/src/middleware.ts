import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/// Forwards the requested pathname as a header so Server Components can
/// branch on it without falling back to client rendering. This is the
/// canonical Next.js pattern (the framework intentionally omits a sync
/// pathname API server-side; you set the header here once).
///
/// Also sets a strict baseline Content Security Policy. The inbox HTML
/// renderer additionally sanitizes message bodies with DOMPurify so the
/// CSP doesn't have to allow inline event handlers.
export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  response.headers.set('x-pathname', request.nextUrl.pathname)

  // Conservative CSP — third-party email payloads can ship with arbitrary
  // CSS/script otherwise. We allow inline styles since email HTML uses
  // them everywhere; scripts are blocked entirely in production.
  // React Fast Refresh needs `unsafe-eval` in dev only.
  const isDev = process.env.NODE_ENV !== 'production'
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'"
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss: ws:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  )

  return response
}

export const config = {
  // Skip Next internals and static assets — applying middleware to those
  // adds latency for no benefit.
  matcher: '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
}
