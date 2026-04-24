import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      // DB-gated suites (setup.test.ts, auth.test.ts) check
      // `process.env.DATABASE_URL` to decide whether to run.
      // Our PGlite fixture overrides getDb() entirely so the URL
      // is never actually dialled — we just need the gate open.
      DATABASE_URL: 'postgresql://unused@localhost:5432/test-fixture',
      // Feature flag the setup/skip-dns route reads. Tests are run
      // in a hermetic environment with no real DNS, so the skip
      // branch is always acceptable.
      ALLOW_SKIP_DNS: 'true',
    },
    // Global fixture — every test file boots against an in-process
    // PGlite Postgres with the production schema applied, and gets a
    // clean slate before each `it`. See src/test-support/setup.ts.
    setupFiles: ['./src/test-support/setup.ts'],
    // The boot hook applies every migration file + seeds base fixtures.
    // Under parallel workers the default 10s isn't enough once the
    // migration set grows; bump to 30s so the first beforeAll has room.
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
