/**
 * X-Response-Time middleware.
 *
 * Sets `X-Response-Time: <ms>ms` on every response so we can spot
 * slow endpoints from the network panel / curl `-w` without a full
 * APM stack. Values are wall-clock milliseconds, integer-rounded;
 * sub-ms responses report `0ms` which is fine for a rough signal.
 *
 * Mounted globally before route dispatch in `app.ts`. Costs ~one
 * `Date.now()` per request — negligible.
 */

import { createMiddleware } from 'hono/factory'

export const responseTime = createMiddleware(async (c, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  c.res.headers.set('X-Response-Time', `${ms}ms`)
})
