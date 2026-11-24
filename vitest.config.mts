import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

/** Unit tests: pure logic of main, shared and renderer (no Electron, no DOM). E2E lives in tests/e2e (Playwright). */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@': resolve('src/renderer/src')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // Dates and DST are asserted in Kyiv time (the author's zone, DST on 2026-03-29 and 2026-10-25).
    env: { TZ: 'Europe/Kyiv' }
  }
})
