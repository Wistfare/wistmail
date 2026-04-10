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
  } catch (err: unknown) {
    // "already exists" errors are safe to ignore — tables were created by a previous migration
    const errStr = String(err)
    const causeStr = err && typeof err === 'object' && 'cause' in err ? String((err as { cause: unknown }).cause) : ''
    if (errStr.includes('already exists') || causeStr.includes('already exists')) {
      console.log('Database tables already exist, skipping migration')
    } else {
      console.error('Migration failed:', err)
      process.exit(1)
    }
  }

  serve({
    fetch: app.fetch,
    port,
  })

  console.log(`Wistfare Mail API running on http://localhost:${port}`)
}

start()
