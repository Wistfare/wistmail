import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { resetDbForTests, setDbForTests } from '../lib/db.js'
import {
  closeTestDb,
  getTestDb,
  resetTestDb,
  seedBaseFixtures,
} from './pg-fixture.js'

/// Global vitest hooks — registered via `test.setupFiles` in
/// `vitest.config.ts`. Every test file gets:
///   • A fresh in-process PGlite Postgres with the production schema
///     applied, booted once on the first beforeAll.
///   • A truncate-before-each hook so neighbouring tests don't see
///     each other's data. TRUNCATE ... CASCADE preserves the schema
///     and resets serial counters — cheaper than dropping the DB.
/// Setting `VITEST_SKIP_DB=1` turns the fixture off entirely, which
/// is useful when a suite deliberately tests the "DB unreachable"
/// path.

const skip = process.env.VITEST_SKIP_DB === '1'

beforeAll(async () => {
  if (skip) return
  const db = await getTestDb()
  setDbForTests(db)
})

beforeEach(async () => {
  if (skip) return
  await resetTestDb()
  const db = await getTestDb()
  // Re-seed the baseline user / domain / mailbox / api-key rows so
  // every test starts from the same minimal-but-valid state. Tests
  // that want custom fixtures can layer on top via their own inserts.
  await seedBaseFixtures(db)
  // Intercept outbound fetches to the mail-engine — the service
  // isn't running in the test process, but several routes call it.
  // We return a simulated success; any test that specifically wants
  // a mail-engine failure can `vi.spyOn(global, 'fetch')` itself.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const target = url instanceof Request ? url.url : String(url)
      if (target.includes('/api/v1/send')) {
        return new Response(JSON.stringify({ status: 'sent' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Anything else — fall back to real fetch so tests that
      // deliberately hit other endpoints still work.
      return new Response('', { status: 404 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  if (skip) return
  resetDbForTests()
  await closeTestDb()
})
