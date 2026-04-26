/// Regression test: labels — including AI-applied ones — must ship
/// inline in the inbox list response. The mobile + web inbox rows
/// render `email.labels` directly and don't refetch; if this contract
/// breaks the chip strip silently goes blank.

import { describe, expect, it, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  domains,
  emailLabels,
  emails,
  labels as labelsTable,
  mailboxes,
  users,
  type Database,
} from '@wistmail/db'
import { getDb } from '../lib/db.js'
import { EmailService } from './email.js'

const DB_URL = process.env.DATABASE_URL
const describeIf = DB_URL ? describe : describe.skip

interface Seed {
  db: Database
  userId: string
  mailboxId: string
}

async function seed(): Promise<Seed> {
  const db = getDb()
  const userId = `u_lbl_${randomBytes(3).toString('hex')}`
  const domainId = `dom_lbl_${randomBytes(3).toString('hex')}`
  const mailboxId = `mbx_lbl_${randomBytes(3).toString('hex')}`
  await db.insert(users).values({
    id: userId,
    email: `lbl.${randomBytes(2).toString('hex')}@labels-test.example`,
    name: 'Label',
    passwordHash: 'unused',
    setupComplete: true,
  })
  await db.insert(domains).values({
    id: domainId,
    userId,
    name: `lbl-${randomBytes(3).toString('hex')}.example`,
    verified: true,
    dnsRecords: {},
  } as unknown as typeof domains.$inferInsert)
  await db.insert(mailboxes).values({
    id: mailboxId,
    userId,
    domainId,
    address: `inbox@${randomBytes(3).toString('hex')}.example`,
    displayName: 'Inbox',
  })
  return { db, userId, mailboxId }
}

describeIf('EmailService.listByFolder — labels in payload', () => {
  let s: Seed
  beforeEach(async () => {
    s = await seed()
  })

  it('returns the joined labels (both user + AI-applied) on each row', async () => {
    const { db, mailboxId } = s
    const svc = new EmailService(db)

    // Two labels: one user-created, one AI-applied. The list payload
    // doesn't differentiate by source — it just ships every join row.
    const userLabelId = `lbl_user_${randomBytes(3).toString('hex')}`
    const aiLabelId = `lbl_ai_${randomBytes(3).toString('hex')}`
    await db.insert(labelsTable).values([
      { id: userLabelId, mailboxId: s.mailboxId, name: 'Work', color: '#FF0000' },
      { id: aiLabelId, mailboxId: s.mailboxId, name: 'Urgent', color: '#FFCC00' },
    ] as unknown as typeof labelsTable.$inferInsert[])

    const emailId = `eml_${randomBytes(3).toString('hex')}`
    await db.insert(emails).values({
      id: emailId,
      messageId: `msg-${randomBytes(4).toString('hex')}`,
      mailboxId,
      fromAddress: 'sender@example.com',
      toAddresses: ['inbox@example.com'],
      cc: [],
      bcc: [],
      subject: 'has labels',
      textBody: 'hi',
      folder: 'inbox',
    } as unknown as typeof emails.$inferInsert)

    await db.insert(emailLabels).values([
      // User-applied
      { emailId, labelId: userLabelId },
      // AI-applied — same join, just a different conceptual source.
      // (Source tracking lives elsewhere if it's needed; the list
      // payload just stitches every joined row in.)
      { emailId, labelId: aiLabelId },
    ])

    const page = await svc.listByFolder(s.userId, 'inbox', 1, 10)

    expect(page.data).toHaveLength(1)
    const row = page.data[0]
    expect(row.id).toBe(emailId)
    const labelNames = row.labels.map((l) => l.name).sort()
    expect(labelNames).toEqual(['Urgent', 'Work'])
  })

  it('returns an empty labels array (not undefined) when none are joined', async () => {
    const { db, mailboxId } = s
    const svc = new EmailService(db)
    const emailId = `eml_${randomBytes(3).toString('hex')}`
    await db.insert(emails).values({
      id: emailId,
      messageId: `msg-${randomBytes(4).toString('hex')}`,
      mailboxId,
      fromAddress: 'sender@example.com',
      toAddresses: ['inbox@example.com'],
      cc: [],
      bcc: [],
      subject: 'no labels',
      textBody: 'hi',
      folder: 'inbox',
    } as unknown as typeof emails.$inferInsert)

    const page = await svc.listByFolder(s.userId, 'inbox', 1, 10)

    expect(page.data).toHaveLength(1)
    expect(page.data[0].labels).toEqual([])
  })
})
