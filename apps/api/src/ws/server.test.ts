import { describe, it, expect } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { authenticateRequest } from './server.js'

function makeReq(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage
}

describe('authenticateRequest', () => {
  it('returns null when no cookie header present', async () => {
    expect(await authenticateRequest(makeReq({}))).toBe(null)
  })

  it('returns null when wm_session cookie is missing among other cookies', async () => {
    expect(await authenticateRequest(makeReq({ cookie: 'other=abc; foo=bar' }))).toBe(null)
  })

  // Session validity is exercised end-to-end by an integration test that spins
  // up the HTTP server with a real DB; here we verify the parser semantics.
})
