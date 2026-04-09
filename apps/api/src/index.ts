import { serve } from '@hono/node-server'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { app } from './app.js'
import { getDb } from './lib/db.js'

const port = parseInt(process.env.API_PORT || '3001', 10)

async function start() {
  // Run database migrations before starting the server
  try {
    const db = getDb()
    await migrate(db, { migrationsFolder: '../../packages/db/drizzle' })
    console.log('Database migrations applied')
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  }

  serve({
    fetch: app.fetch,
    port,
  })

  console.log(`Wistfare Mail API running on http://localhost:${port}`)
}

start()
