import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { errorHandler } from './middleware/error-handler.js'
import { emailRoutes } from './routes/emails.js'
import { domainRoutes } from './routes/domains.js'
import { apiKeyRoutes } from './routes/api-keys.js'
import { webhookRoutes } from './routes/webhooks.js'
import { templateRoutes } from './routes/templates.js'
import { audienceRoutes } from './routes/audiences.js'
import { analyticsRoutes } from './routes/analytics.js'
import { authRoutes } from './routes/auth.js'
import { setupRoutes } from './routes/setup.js'
import { adminRoutes } from './routes/admin.js'
import { inboxRoutes } from './routes/inbox.js'

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
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  }),
)
app.use('*', prettyJSON())
app.onError(errorHandler)

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'WistMail API',
    version: '0.1.0',
    status: 'healthy',
  })
})

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

// API v1 routes
const v1 = new Hono<AppEnv>()

v1.route('/auth', authRoutes)
v1.route('/emails', emailRoutes)
v1.route('/domains', domainRoutes)
v1.route('/api-keys', apiKeyRoutes)
v1.route('/webhooks', webhookRoutes)
v1.route('/templates', templateRoutes)
v1.route('/audiences', audienceRoutes)
v1.route('/analytics', analyticsRoutes)
v1.route('/setup', setupRoutes)
v1.route('/admin', adminRoutes)
v1.route('/inbox', inboxRoutes)

app.route('/api/v1', v1)
