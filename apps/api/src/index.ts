import { serve } from '@hono/node-server'
import { app } from './app.js'

const port = parseInt(process.env.API_PORT || '3001', 10)

serve({
  fetch: app.fetch,
  port,
})

console.log(`WistMail API running on http://localhost:${port}`)
