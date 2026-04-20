import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
    },
    // Global fixture — every test file boots against an in-process
    // PGlite Postgres with the production schema applied, and gets a
    // clean slate before each `it`. See src/test-support/setup.ts.
    setupFiles: ['./src/test-support/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
