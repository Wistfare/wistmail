import { beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  organizations,
  orgMembers,
  projects,
  projectTasks,
  sessions,
  users,
} from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import { app } from '../app.js'
import { getTestDb, resetTestDb } from '../test-support/pg-fixture.js'

/**
 * End-to-end tests for the Phase H.A work counters endpoint
 * (AUDIT-6.3). Validates auth gating + the four counters returned to
 * power the WorkSidebar.
 */

async function seedAuthedOrg(db: Awaited<ReturnType<typeof getTestDb>>) {
  const userId = generateId('u')
  const orgId = generateId('org')
  const sessionId = generateId('ses')
  const token = randomBytes(32).toString('hex')

  await db.insert(users).values({
    id: userId,
    email: `${userId}@work.test`,
    name: 'Owner',
    passwordHash: 'x',
    setupComplete: true,
  })
  await db.insert(organizations).values({
    id: orgId,
    name: 'Acme',
    slug: `acme-${userId.slice(0, 6)}`,
    ownerId: userId,
  } as unknown as typeof organizations.$inferInsert)
  await db.insert(orgMembers).values({
    id: generateId('mem'),
    orgId,
    userId,
    role: 'owner',
  })
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })

  return { userId, orgId, cookie: `wm_session=${token}` }
}

async function seedProject(
  db: Awaited<ReturnType<typeof getTestDb>>,
  userId: string,
) {
  const projectId = generateId('prj')
  const now = new Date()
  await db.insert(projects).values({
    id: projectId,
    ownerId: userId,
    name: 'Test project',
    memberUserIds: [],
    status: 'active',
    progress: 0,
    createdAt: now,
    updatedAt: now,
  })
  return projectId
}

async function insertTask(
  db: Awaited<ReturnType<typeof getTestDb>>,
  projectId: string,
  status: 'todo' | 'in_progress' | 'done',
  dueDate: Date | null,
  updatedAt?: Date,
) {
  const id = generateId('tsk')
  const now = updatedAt ?? new Date()
  await db.insert(projectTasks).values({
    id,
    projectId,
    title: `Task ${status}`,
    status,
    dueDate,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

describe('GET /api/v1/work/counters', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  it('returns 401 without a session cookie', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/work/counters'),
    )
    expect(res.status).toBe(401)
  })

  it('returns all-zero counters for a user with no projects', async () => {
    const db = await getTestDb()
    const { cookie } = await seedAuthedOrg(db)
    const res = await app.fetch(
      new Request('http://localhost/api/v1/work/counters', {
        headers: { Cookie: cookie },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      today: number
      week: number
      overdue: number
      done: number
    }
    expect(body).toEqual({ today: 0, week: 0, overdue: 0, done: 0 })
  })

  it('counts today / week / overdue / done correctly', async () => {
    const db = await getTestDb()
    const { userId, cookie } = await seedAuthedOrg(db)
    const projectId = await seedProject(db, userId)

    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const noonToday = new Date(startOfDay)
    noonToday.setHours(12)
    const inThreeDays = new Date(startOfDay)
    inThreeDays.setDate(inThreeDays.getDate() + 3)
    const yesterday = new Date(startOfDay)
    yesterday.setDate(yesterday.getDate() - 1)

    await insertTask(db, projectId, 'todo', noonToday) // today + week
    await insertTask(db, projectId, 'in_progress', inThreeDays) // week
    await insertTask(db, projectId, 'todo', yesterday) // overdue
    await insertTask(db, projectId, 'done', null) // done

    const res = await app.fetch(
      new Request('http://localhost/api/v1/work/counters', {
        headers: { Cookie: cookie },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      today: number
      week: number
      overdue: number
      done: number
    }
    expect(body.today).toBe(1)
    expect(body.week).toBe(2)
    expect(body.overdue).toBe(1)
    expect(body.done).toBe(1)
  })

  it('does not count tasks from another user', async () => {
    const db = await getTestDb()
    const { cookie } = await seedAuthedOrg(db)
    const other = await seedAuthedOrg(db)
    const otherProject = await seedProject(db, other.userId)
    const noon = new Date()
    noon.setHours(12, 0, 0, 0)
    await insertTask(db, otherProject, 'todo', noon)

    const res = await app.fetch(
      new Request('http://localhost/api/v1/work/counters', {
        headers: { Cookie: cookie },
      }),
    )
    const body = (await res.json()) as { today: number }
    expect(body.today).toBe(0)
  })
})
