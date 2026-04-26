import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { errorHandler } from './middleware/error-handler.js'
import { timezoneTracker } from './middleware/timezone-tracker.js'
import { emailRoutes } from './routes/emails.js'
import { domainRoutes } from './routes/domains.js'
import { apiKeyRoutes } from './routes/api-keys.js'
import { webhookRoutes } from './routes/webhooks.js'
import { templateRoutes } from './routes/templates.js'
import { audienceRoutes } from './routes/audiences.js'
import { contactRoutes } from './routes/contacts.js'
import { analyticsRoutes } from './routes/analytics.js'
import { authRoutes } from './routes/auth.js'
import { setupRoutes } from './routes/setup.js'
import { adminRoutes } from './routes/admin.js'
import { inboxRoutes } from './routes/inbox.js'
import { notificationActionRoutes } from './routes/notification-actions.js'
import { attachmentRoutes } from './routes/attachments.js'
import { inboundRoutes } from './routes/inbound.js'
import { userRoutes } from './routes/user.js'
import { chatRoutes } from './routes/chat.js'
import { labelRoutes } from './routes/labels.js'
import { calendarRoutes } from './routes/calendar.js'
import { projectRoutes } from './routes/projects.js'
import { todayRoutes } from './routes/today.js'
import { searchRoutes } from './routes/search.js'
import { mfaRoutes } from './routes/mfa.js'
import { domains as domainsTable } from '@wistmail/db'

export type AppEnv = {
  Variables: {
    userId: string
    apiKeyId: string | null
    scopes: string[]
  }
}

export const app = new Hono<AppEnv>()

// Global middleware
app.use('*', logger())
app.use(
  '*',
  cors({
    // In development we accept any localhost / 127.0.0.1 port so dev
    // setups using auto-allocated preview ports (Next's port shuffle
    // when 3000 is busy, Storybook, etc) don't get CORS-blocked. In
    // production we still pin the canonical web origin.
    origin: process.env.NODE_ENV === 'production'
      ? ['https://mail.wistfare.com']
      : (origin) => {
          if (!origin) return null
          if (
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
            origin === 'https://mail.wistfare.com'
          ) {
            return origin
          }
          return null
        },
    credentials: true,
  }),
)
app.use('*', prettyJSON())
app.onError(errorHandler)

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Wistfare Mail API',
    version: '0.1.0',
    status: 'healthy',
  })
})

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

// Internal endpoint for mail engine — list registered domains with DKIM keys
app.get('/api/v1/domains/registered', async (c) => {
  const secret = c.req.header('X-Inbound-Secret')
  const expected = process.env.INBOUND_SECRET
  if (!expected || secret !== expected) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const { getDb } = await import('./lib/db.js')
  const db = getDb()
  const allDomains = await db
    .select({
      name: domainsTable.name,
      dkimPrivateKey: domainsTable.dkimPrivateKey,
      dkimSelector: domainsTable.dkimSelector,
    })
    .from(domainsTable)

  return c.json({
    domains: allDomains.map((d) => ({
      name: d.name,
      dkimPrivateKey: d.dkimPrivateKey || '',
      dkimSelector: d.dkimSelector || 'wistmail',
    })),
  })
})

// API v1 routes
const v1 = new Hono<AppEnv>()

// Per-user IANA timezone tracking. Reads X-Client-Timezone, persists
// when changed (debounced to ~1/hr per user). Runs after each route
// group's own sessionAuth, so it's a no-op for unauthenticated calls.
v1.use('*', timezoneTracker)

v1.route('/auth', authRoutes)
v1.route('/emails', emailRoutes)
v1.route('/domains', domainRoutes)
v1.route('/api-keys', apiKeyRoutes)
v1.route('/webhooks', webhookRoutes)
v1.route('/templates', templateRoutes)
v1.route('/audiences', audienceRoutes)
v1.route('/contacts', contactRoutes)
v1.route('/analytics', analyticsRoutes)
v1.route('/setup', setupRoutes)
v1.route('/admin', adminRoutes)
v1.route('/inbox', inboxRoutes)
v1.route('/inbox/attachments', attachmentRoutes)
v1.route('/internal', inboundRoutes)
v1.route('/user', userRoutes)
v1.route('/chat', chatRoutes)
v1.route('/labels', labelRoutes)
v1.route('/calendar', calendarRoutes)
v1.route('/projects', projectRoutes)
v1.route('/today', todayRoutes)
v1.route('/search', searchRoutes)
v1.route('/mfa', mfaRoutes)
// Notification action routes — Bearer-token authenticated, NOT
// session-cookied. Live under their own prefix so the auth contract
// is unambiguous from the URL alone.
v1.route('/notify', notificationActionRoutes)

app.route('/api/v1', v1)
