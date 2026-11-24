// Runs electron-vite from the canonical project path.
// On Windows a terminal can start in `c:\…` while Node resolves packages to `C:\…`; with mixed drive-letter
// casing the bundler treats one file as two modules (two React copies → blank window on startup).
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const cwd = realpathSync.native(process.cwd())
const bin = fileURLToPath(new URL('../node_modules/electron-vite/bin/electron-vite.js', import.meta.url))
const r = spawnSync(process.execPath, [realpathSync.native(bin), ...process.argv.slice(2)], { cwd, stdio: 'inherit' })
process.exit(r.status ?? 1)
