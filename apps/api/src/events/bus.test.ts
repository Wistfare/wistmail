import { describe, it, expect } from 'vitest'
import { eventBus } from './bus.js'
import type { EmailNewEvent } from './types.js'

describe('eventBus', () => {
  it('delivers events to subscribers of the matching userId', () => {
    const received: EmailNewEvent[] = []
    const unsubscribe = eventBus.subscribe('u_1', (e) => {
      if (e.type === 'email.new') received.push(e)
    })

    eventBus.publish({
      type: 'email.new',
      userId: 'u_1',
      emailId: 'e1',
      mailboxId: 'mbx_1',
      folder: 'inbox',
      fromAddress: 'a@x.com',
      subject: 's',
      preview: 'p',
      createdAt: new Date().toISOString(),
    })

    expect(received).toHaveLength(1)
    expect(received[0].emailId).toBe('e1')
    unsubscribe()
  })

  it('does not deliver to non-matching user subscribers', () => {
    let u1Count = 0
    let u2Count = 0
    const off1 = eventBus.subscribe('u_1', () => u1Count++)
    const off2 = eventBus.subscribe('u_2', () => u2Count++)

    eventBus.publish({
      type: 'email.new',
      userId: 'u_1',
      emailId: 'e1',
      mailboxId: 'mbx_1',
      folder: 'inbox',
      fromAddress: 'a@x.com',
      subject: '',
      preview: '',
      createdAt: new Date().toISOString(),
    })

    expect(u1Count).toBe(1)
    expect(u2Count).toBe(0)
    off1()
    off2()
  })

  it('unsubscribe stops further deliveries', () => {
    let count = 0
    const off = eventBus.subscribe('u_3', () => count++)
    eventBus.publish({
      type: 'email.deleted',
      userId: 'u_3',
      emailId: 'e1',
    })
    expect(count).toBe(1)
    off()
    eventBus.publish({
      type: 'email.deleted',
      userId: 'u_3',
      emailId: 'e2',
    })
    expect(count).toBe(1)
  })
})
