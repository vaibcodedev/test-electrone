/**
 * Launches the built app (out/) with an isolated user-data dir and screenshots routes.
 * Usage: node scripts/snap.mjs [outDir] [route...]   e.g. node scripts/snap.mjs shots / /ideas
 * Env: SNAP_THEME=dark|light, SNAP_SEED=1 to create demo data first.
 */
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const [outDir = 'shots', ...routes] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const userData = process.env.SNAP_USER_DATA ?? mkdtempSync(join(tmpdir(), 'vault-snap-'))

const app = await electron.launch({
  args: [resolve('.'), `--user-data-dir=${userData}`],
  env: { ...process.env, NODE_ENV: 'production' }
})
const errors = []
const win = await app.firstWindow()
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
win.on('pageerror', (e) => errors.push(String(e)))
await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => x.isVisible()) ?? BrowserWindow.getAllWindows()[0]
  w.setSize(1440, 900)
  w.show()
})
await win.waitForLoadState('domcontentloaded')

const rpc = (path, arg) => win.evaluate(([p, a]) => window.vault.rpc(p, a), [path, arg])

if (process.env.SNAP_THEME) await rpc('settings.update', { theme: process.env.SNAP_THEME })
if (process.env.SNAP_SEED) {
  const { seed } = await import('./seed.mjs')
  await seed(rpc)
}

for (const route of routes.length ? routes : ['/']) {
  await win.evaluate((r) => (window.location.hash = '#' + r), route)
  await win.waitForTimeout(1200)
  const name = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'
  await win.screenshot({ path: join(outDir, `${name}.png`) })
  console.log('shot', name)
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'))
await app.close()
