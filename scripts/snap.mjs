/**
 * Launches the built app (out/) with an isolated user-data dir and screenshots routes.
 * Usage: node scripts/snap.mjs [outDir] [route...]   e.g. node scripts/snap.mjs shots / /ideas
 * Env: SNAP_THEME=dark|light, SNAP_SEED=1 to create demo data first, SNAP_SANDBOX=1 to open «Тестовий режим»
 * (its data goes to `${userData}-sandbox`, removed afterwards).
 */
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const [outDir = 'shots', ...routes] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const userData = process.env.SNAP_USER_DATA ?? mkdtempSync(join(tmpdir(), 'vault-snap-'))

// SNAP_EXE=dist/win-unpacked/Vault.exe tests the packaged build instead of out/.
const app = await electron.launch({
  ...(process.env.SNAP_EXE ? { executablePath: resolve(process.env.SNAP_EXE) } : {}),
  args: [
    ...(process.env.SNAP_EXE ? [] : [resolve('.')]),
    `--user-data-dir=${userData}`,
    ...(process.env.SNAP_SANDBOX ? ['--vault-sandbox'] : [])
  ],
  env: { ...process.env, NODE_ENV: 'production', VAULT_NO_NOTIFY: '1' }
})
const errors = []
const win = await app.firstWindow()
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
win.on('pageerror', (e) => errors.push(String(e.stack || e)))
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

/** Replaces {board} {project} {client} {component} {checklist} {moodboard} {platform} … with real ids. */
async function resolveRoute(route) {
  const lookups = {
    board: ['boards.list'],
    project: ['projects.list'],
    client: ['clients.list'],
    component: ['components.list'],
    checklist: ['checklists.list', { kind: 'run' }],
    moodboard: ['moodboards.list'],
    idea: ['ideas.list'],
    claude: ['claude.list'],
    snippet: ['snippets.list'],
    card: ['cards.due', { from: 0, to: 9e15 }],
    word: ['english.list'],
    question: ['jobs.questions'],
    // Upwork has the seeded proposals, credits and stats.
    platform: ['platforms.list', undefined, (xs) => xs.find((x) => x.kind === 'upwork') ?? xs[0]]
  }
  let out = route
  for (const [token, [path, arg, pick = (xs) => xs[0]]] of Object.entries(lookups)) {
    if (!out.includes(`{${token}}`)) continue
    const r = await rpc(path, arg)
    const hit = r.ok ? pick(r.data) : undefined
    out = out.replace(`{${token}}`, hit ? hit.id : 'missing')
  }
  return out
}

for (const raw of routes.length ? routes : ['/']) {
  const route = await resolveRoute(raw)
  await win.evaluate((r) => (window.location.hash = '#' + r), route)
  await win.waitForTimeout(1200)
  const name = raw.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'
  await win.screenshot({ path: join(outDir, `${name}.png`) })
  console.log('shot', name)
}
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'))
await app.close()
if (process.env.SNAP_SANDBOX) rmSync(`${userData}-sandbox`, { recursive: true, force: true, maxRetries: 3 })
