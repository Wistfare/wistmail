import type { IncomingMessage, Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { AuthService } from '../services/auth.js'
import { getDb } from '../lib/db.js'
import { eventBus } from '../events/bus.js'

const STREAM_PATH = '/api/v1/stream'
const PING_INTERVAL_MS = 30_000

/**
 * Attach a WebSocket server to the given HTTP server. Authenticates via the
 * `wm_session` cookie present on the upgrade request, then subscribes the
 * connection to the user's event bus channel for the lifetime of the socket.
 */
export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== STREAM_PATH) {
      socket.destroy()
      return
    }

    const userId = await authenticateRequest(req)
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      registerConnection(ws, userId)
    })
  })

  return wss
}

function registerConnection(ws: WebSocket, userId: string): void {
  let isAlive = true
  ws.on('pong', () => {
    isAlive = true
  })

  const heartbeat = setInterval(() => {
    if (!isAlive) {
      ws.terminate()
      return
    }
    isAlive = false
    try {
      ws.ping()
    } catch {
      /* ignore */
    }
  }, PING_INTERVAL_MS)

  const unsubscribe = eventBus.subscribe(userId, (event) => {
    if (ws.readyState !== ws.OPEN) return
    try {
      ws.send(JSON.stringify(event))
    } catch {
      /* ignore */
    }
  })

  ws.send(JSON.stringify({ type: 'connection.ready', userId }))

  ws.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
  ws.on('error', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
}

/**
 * Validates the `wm_session` cookie on an incoming upgrade request and returns
 * the userId if the session is valid. Exported for test visibility.
 */
export async function authenticateRequest(req: IncomingMessage): Promise<string | null> {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return null

  const token = parseCookie(cookieHeader, 'wm_session')
  if (!token) return null

  try {
    const db = getDb()
    const auth = new AuthService(db)
    const result = await auth.validateSession(token)
    return result?.userId ?? null
  } catch {
    return null
  }
}

function parseCookie(header: string, name: string): string | null {
  const pairs = header.split(/;\s*/)
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const key = pair.slice(0, eq).trim()
    if (key === name) {
      return decodeURIComponent(pair.slice(eq + 1))
    }
  }
  return null
}

export { STREAM_PATH }
