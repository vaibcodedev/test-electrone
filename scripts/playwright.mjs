// Runs the Playwright test runner from the canonical project path (see scripts/electron-vite.mjs:
// `c:\…` vs `C:\…` loads modules twice on Windows).
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cwd = realpathSync.native(process.cwd())
const bin = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url))
const r = spawnSync(process.execPath, [realpathSync.native(bin), ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit'
})
process.exit(r.status ?? 1)
