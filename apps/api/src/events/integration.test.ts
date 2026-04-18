/**
 * Integration-style test verifying that the event bus fires with the right
 * shape when an email.new publish happens. Isolated from DB / HTTP — the goal
 * is to verify the contract between the emit site (receiver) and the bus.
 */
import { describe, it, expect } from 'vitest'
import { eventBus } from './bus.js'
import type { EmailNewEvent } from './types.js'

describe('event bus integration with email.new payload shape', () => {
  it('delivers a well-formed email.new to the subscribed user', async () => {
    const received: EmailNewEvent[] = []
    const off = eventBus.subscribe('u_42', (e) => {
      if (e.type === 'email.new') received.push(e)
    })

    eventBus.publish({
      type: 'email.new',
      userId: 'u_42',
      emailId: 'eml_xxx',
      mailboxId: 'mbx_1',
      folder: 'inbox',
      fromAddress: 'alex@x.com',
      subject: 'Hello',
      preview: 'Short preview',
      createdAt: '2026-01-01T00:00:00Z',
    })

    expect(received).toHaveLength(1)
    const evt = received[0]
    expect(evt.emailId).toBe('eml_xxx')
    expect(evt.mailboxId).toBe('mbx_1')
    expect(evt.folder).toBe('inbox')
    expect(evt.subject).toBe('Hello')
    off()
  })
})
