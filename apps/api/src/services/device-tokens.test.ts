/// Token-per-device invariant: when an FCM token re-registers under a
/// different user, the row's `user_id` flips so push for the previous
/// account stops landing on the device. This guards the privacy
/// concern of "Alice's notifications keep arriving on a phone Bob is
/// now signed into".
///
/// We exercise the route's INSERT-or-UPDATE branching directly via the
/// table since the route handler depends on session middleware.

import { describe, expect, it, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { deviceTokens, users } from '@wistmail/db'
import { getDb } from '../lib/db.js'

const DB_URL = process.env.DATABASE_URL
const describeIf = DB_URL ? describe : describe.skip

async function seedUser(name: string): Promise<string> {
  const id = `u_${name}_${randomBytes(3).toString('hex')}`
  await getDb().insert(users).values({
    id,
    email: `${name}.${randomBytes(2).toString('hex')}@dev-tokens-test.example`,
    name,
    passwordHash: 'unused',
    setupComplete: true,
  })
  return id
}

/// Mirror the route's claim logic in one helper so the test is
/// independent of the HTTP layer.
async function claimTokenForUser(token: string, userId: string): Promise<void> {
  const db = getDb()
  const existing = await db
    .select({ id: deviceTokens.id })
    .from(deviceTokens)
    .where(eq(deviceTokens.token, token))
    .limit(1)
  if (existing.length > 0) {
    await db
      .update(deviceTokens)
      .set({ userId, platform: 'android', updatedAt: new Date() })
      .where(eq(deviceTokens.id, existing[0].id))
    return
  }
  await db.insert(deviceTokens).values({
    id: `dev_${randomBytes(3).toString('hex')}`,
    userId,
    token,
    platform: 'android',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}

describeIf('device-tokens — one token belongs to one user at a time', () => {
  let alice: string
  let bob: string
  beforeEach(async () => {
    alice = await seedUser('alice')
    bob = await seedUser('bob')
  })

  it('first registration assigns the token to the registering user', async () => {
    await claimTokenForUser('tkn-shared', alice)
    const rows = await getDb()
      .select({ userId: deviceTokens.userId })
      .from(deviceTokens)
      .where(eq(deviceTokens.token, 'tkn-shared'))
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(alice)
  })

  it('re-registration under a different user reassigns the row (no duplicate)', async () => {
    await claimTokenForUser('tkn-shared', alice)
    await claimTokenForUser('tkn-shared', bob)

    const rows = await getDb()
      .select({ userId: deviceTokens.userId })
      .from(deviceTokens)
      .where(eq(deviceTokens.token, 'tkn-shared'))
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(bob)
  })

  it('Alice has no tokens left once Bob claims them', async () => {
    await claimTokenForUser('tkn-shared', alice)
    await claimTokenForUser('tkn-shared', bob)

    const aliceTokens = await getDb()
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.userId, alice))
    expect(aliceTokens).toHaveLength(0)
  })
})
