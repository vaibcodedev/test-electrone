// Runs vitest from the canonical project path (same reason as scripts/electron-vite.mjs): with `c:\…` vs `C:\…`
// Node loads vitest twice and `describe` fails with "Cannot read properties of undefined (reading 'config')".
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cwd = realpathSync.native(process.cwd())
const bin = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const r = spawnSync(process.execPath, [realpathSync.native(bin), ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit'
})
process.exit(r.status ?? 1)
