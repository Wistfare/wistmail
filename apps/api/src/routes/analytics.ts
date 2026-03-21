import { Hono } from 'hono'
import { apiKeyAuth, requireScope } from '../middleware/auth.js'
import type { AppEnv } from '../app.js'

export const analyticsRoutes = new Hono<AppEnv>()

analyticsRoutes.use('*', apiKeyAuth)

/**
 * GET /api/v1/analytics/overview
 * Get delivery/open/click/bounce rates.
 */
analyticsRoutes.get('/overview', requireScope('analytics:read'), async (c) => {
  // TODO: Aggregate from sending_logs

  return c.json({
    period: {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
    },
    totals: {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      failed: 0,
    },
    rates: {
      deliveryRate: 0,
      openRate: 0,
      clickRate: 0,
      bounceRate: 0,
      complaintRate: 0,
    },
  })
})

/**
 * GET /api/v1/analytics/emails
 * Get per-email event timeline.
 */
analyticsRoutes.get('/emails', requireScope('analytics:read'), async (c) => {
  return c.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false })
})
