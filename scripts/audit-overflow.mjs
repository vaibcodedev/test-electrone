// UI audit: extreme data (500-char titles, unbroken words, huge sums) on every route → prints elements that spill out of their box or get cut mid-word, saves screenshots. Usage: npm run build; node scripts/audit-overflow.mjs <outDir> [dark|light]
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { seed } from './seed.mjs'
import { makeRpc, seedMonsters } from './fixtures.mjs'
import { ENTITY_META } from '../src/shared/entity-types.ts'

const out = process.argv[2]
const theme = process.argv[3] ?? 'dark'
mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: [resolve('.'), `--user-data-dir=${mkdtempSync(join(tmpdir(), 'vault-snap-'))}`],
  env: { ...process.env, NODE_ENV: 'production' }
})
const win = await app.firstWindow()
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.setSize(1280, 820)
  w.show()
})
await win.waitForLoadState('domcontentloaded')
const raw = (p, a) => win.evaluate(([p, a]) => window.vault.rpc(p, a), [p, a])
const rpc = makeRpc(raw, 'audit-overflow')
await seed(raw)
await rpc('settings.update', { theme })

// ── extreme data (shared with snap-all) ──
const extreme = await seedMonsters(rpc)
const plat = (await rpc('platforms.list', {}))?.[0]

const LISTS = ['/', '/ideas', '/boards', '/calendar', '/checklists', '/freelance', '/freelance/templates', '/freelance/portfolio',
  '/freelance/flags', '/freelance/goals', '/freelance/calculator', '/finance', '/finance/income', '/finance/expenses',
  '/finance/withdrawals', '/clients', '/notes', '/claude', '/snippets', '/components', '/libraries', '/fixes', '/designs',
  '/bookmarks', '/english', '/jobs', '/jobs/applications', '/jobs/interviews', '/jobs/companies', '/jobs/resumes',
  '/jobs/questions', '/jobs/stats', '/knowledge', '/review', '/tags', '/trash', '/settings']
// Lists + the detail view of every extreme record + the platform board.
const ROUTES = [
  ...LISTS,
  ...(plat ? [`/freelance/p/${plat.id}`] : []),
  ...Object.entries(extreme).map(([type, id]) => ENTITY_META[type].route(id))
]

const report = {}
for (const r of ROUTES) {
  const route = r
  await win.evaluate((h) => { location.hash = `#${h}` }, route)
  await win.waitForTimeout(900)
  const found = await win.evaluate(() => {
    const vw = innerWidth
    const res = []
    const desc = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 4).join('.')} «${(el.textContent || '').trim().slice(0, 40)}»`
    for (const el of document.querySelectorAll('main *, [data-slot=sidebar] *, [data-slot=card] *')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const rc = el.getBoundingClientRect()
      if (!rc.width || !rc.height) continue
      if (rc.right > vw + 2 && rc.left < vw) res.push(['window', desc(el), Math.round(rc.right - vw)])
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      if (!hasText) continue
      const over = el.scrollWidth - el.clientWidth
      if (over > 2) {
        const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
        if (scrolls) continue
        if (cs.overflowX === 'visible') res.push(['spill', desc(el), over])
        else if (cs.textOverflow !== 'ellipsis') res.push(['cut', desc(el), over])
      }
    }
    return res
  })
  // de-dupe similar entries
  const seen = new Set()
  report[route] = found.filter(([k, d]) => (seen.has(k + d) ? false : seen.add(k + d)))
  if (report[route].length) await win.screenshot({ path: join(out, `${r.replace(/[/?=&{}]+/g, '_')}.png`) })
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
for (const [r, list] of Object.entries(report)) if (list.length) console.log(r, list.length, JSON.stringify(list.slice(0, 6)))
await app.close()
