import { defineConfig } from '@playwright/test'

/**
 * E2E against the BUILT app (out/): run `npm run test:e2e` (builds first) or `npm run test:e2e:only`.
 * One Electron instance per worker with its own temp --user-data-dir (the real Vault data is never touched).
 * Known app bugs are kept as `test.fail(!process.env.SHOW_BUGS, …)`: green by default; `SHOW_BUGS=1` shows
 * their real failures, and a fixed bug turns its test red until the annotation is removed.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One Electron app at a time: each is a full app with tray, global shortcut and capture server.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results'
})
