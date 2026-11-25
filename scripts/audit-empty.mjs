// UI audit: a brand-new empty database on every route → is there a real empty state (not a blank page),
// does loading finish (no skeleton left after 3 s), any console errors? Prints problems, saves screenshots.
// Usage: npm run build; node scripts/audit-empty.mjs <outDir> [dark|light]
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = process.argv[2] ?? 'audit-empty'
const theme = process.argv[3] ?? 'dark'
mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: [resolve('.'), `--user-data-dir=${mkdtempSync(join(tmpdir(), 'vault-snap-'))}`],
  env: { ...process.env, NODE_ENV: 'production' }
})
const win = await app.firstWindow()
const errors = []
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
win.on('pageerror', (e) => errors.push(String(e)))
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.setSize(1440, 900)
  w.show()
})
await win.waitForLoadState('domcontentloaded')
const rpc = (p, a) => win.evaluate(([p, a]) => window.vault.rpc(p, a), [p, a])
// A free shortcut: the installed Vault may hold the default one.
await rpc('settings.update', { theme, quickAddShortcut: 'CommandOrControl+Alt+Shift+F9' })

const ROUTES = ['/', '/ideas', '/boards', '/calendar', '/checklists', '/freelance', '/freelance/templates',
  '/freelance/portfolio', '/freelance/flags', '/freelance/goals', '/freelance/calculator', '/finance', '/finance/income',
  '/finance/expenses', '/finance/withdrawals', '/clients', '/notes', '/claude', '/snippets', '/components', '/libraries',
  '/fixes', '/designs', '/bookmarks', '/english', '/jobs', '/jobs/applications', '/jobs/interviews', '/jobs/companies',
  '/jobs/resumes', '/jobs/questions', '/jobs/stats', '/jobs/boards', '/knowledge', '/review', '/tags', '/trash', '/dev']

const problems = []
for (const route of ROUTES) {
  errors.length = 0
  await win.evaluate((h) => { location.hash = `#${h}` }, route)
  await win.waitForTimeout(3000)
  const state = await win.evaluate(() => {
    const main = document.querySelector('main') ?? document.body
    return {
      empty: !!main.querySelector('[data-slot=empty]'),
      skeleton: main.querySelectorAll('[data-slot=skeleton]').length,
      text: (main.innerText || '').replace(/\s+/g, ' ').trim().length,
      routeError: !!document.querySelector('[data-route-error]')
    }
  })
  const issues = []
  if (state.routeError) issues.push('route error')
  if (state.skeleton > 0) issues.push(`skeleton stuck (${state.skeleton})`)
  if (!state.empty && state.text < 120) issues.push(`blank? text=${state.text}`)
  if (errors.length) issues.push(`console: ${errors.slice(0, 2).join(' | ').slice(0, 160)}`)
  const name = route.replace(/\//g, '_') || '_home'
  await win.screenshot({ path: join(out, `${name}.png`) })
  if (issues.length) problems.push([route, issues])
  console.log(`${issues.length ? '✗' : '✓'} ${route.padEnd(24)} empty-state=${state.empty} ${issues.join('; ')}`)
}
console.log(problems.length ? `\n${problems.length} route(s) with problems` : '\nall routes ok')
await app.close()
