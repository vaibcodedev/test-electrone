// UI audit: scrollbars nobody needs. Visits every route (lists, record details in view and edit mode, the create
// form behind N) and reports rendered scrollbars that scroll almost nothing (≤ 24px — padding, a focus ring or a
// rounding error made the box overflow), `overflow: scroll` boxes with nothing to scroll, and every horizontal
// scrollbar. Saves a screenshot with the found boxes outlined. Usage: npm run build; node scripts/audit-scroll.mjs <outDir> [dark|light]
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { seed } from './seed.mjs'
import { makeRpc, seedMonsters } from './fixtures.mjs'
import { ENTITY_META } from '../src/shared/entity-types.ts'

const out = process.argv[2]
const theme = process.argv[3] ?? 'dark'
if (!out) throw new Error('Usage: node scripts/audit-scroll.mjs <outDir> [dark|light]')
mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: [resolve('.'), `--user-data-dir=${mkdtempSync(join(tmpdir(), 'vault-scroll-'))}`],
  env: { ...process.env, NODE_ENV: 'production', VAULT_NO_NOTIFY: '1' }
})
const win = await app.firstWindow()
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.setSize(1280, 820)
  w.show()
})
await win.waitForLoadState('domcontentloaded')
const raw = (p, a) => win.evaluate(([p, a]) => window.vault.rpc(p, a), [p, a])
const rpc = makeRpc(raw, 'audit-scroll')
// A free global shortcut: the installed Vault may hold the default one.
await rpc('settings.update', { quickAddShortcut: 'CommandOrControl+Alt+Shift+F9', theme })
await seed(raw)
const extreme = await seedMonsters(rpc)

const LISTS = ['/', '/ideas', '/boards', '/calendar', '/checklists', '/freelance', '/freelance/templates', '/freelance/portfolio',
  '/freelance/flags', '/freelance/goals', '/freelance/calculator', '/finance', '/finance/income', '/finance/expenses',
  '/finance/withdrawals', '/clients', '/notes', '/claude', '/snippets', '/components', '/libraries', '/fixes', '/designs',
  '/bookmarks', '/english', '/jobs', '/jobs/applications', '/jobs/interviews', '/jobs/companies', '/jobs/resumes',
  '/jobs/questions', '/jobs/stats', '/jobs/boards', '/dev', '/knowledge', '/review', '/tags', '/trash', '/settings', '/guide']
const DETAILS = Object.entries(extreme).map(([type, id]) => ENTITY_META[type].route(id))

/** Finds scrollbars that scroll (almost) nothing and every horizontal one; outlines them for the screenshot. */
const scan = () =>
  win.evaluate(() => {
    const TINY = 24
    const desc = (el) =>
      `${el.tagName.toLowerCase()}${el.getAttribute('data-slot') ? `[data-slot=${el.getAttribute('data-slot')}]` : ''}.${String(el.className).split(' ').filter(Boolean).slice(0, 5).join('.')} «${(el.textContent || '').trim().slice(0, 40)}»`
    const res = []
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.scrollbarWidth === 'none') continue
      const y = cs.overflowY === 'auto' || cs.overflowY === 'scroll'
      const x = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
      if (!y && !x) continue
      const rc = el.getBoundingClientRect()
      if (rc.width < 8 || rc.height < 8) continue
      const px = (v) => parseFloat(v) || 0
      // The rendered scrollbar's thickness: what the box loses to it besides its borders.
      const vBar = el.offsetWidth - el.clientWidth - px(cs.borderLeftWidth) - px(cs.borderRightWidth)
      const hBar = el.offsetHeight - el.clientHeight - px(cs.borderTopWidth) - px(cs.borderBottomWidth)
      const overY = el.scrollHeight - el.clientHeight
      const overX = el.scrollWidth - el.clientWidth
      let kind = null
      if (vBar > 0 && overY <= 0) kind = 'v-empty'
      else if (vBar > 0 && overY <= TINY) kind = 'v-tiny'
      else if (hBar > 0 && overX <= 0) kind = 'h-empty'
      else if (hBar > 0) kind = 'h-bar'
      if (!kind) continue
      el.style.outline = '3px solid #ff3b30'
      el.style.outlineOffset = '-3px'
      res.push([kind, desc(el), kind.startsWith('h') ? overX : overY])
    }
    return res
  })

const report = {}
const slug = (s) => s.replace(/[/?=&{}]+/g, '_').replace(/^_+|_+$/g, '') || 'home'
async function visit(route, state, act) {
  await win.evaluate((h) => {
    location.hash = `#${h}`
  }, route)
  await win.waitForTimeout(900)
  if (act) {
    const done = await act()
    if (done === false) return
    await win.waitForTimeout(600)
  }
  const found = await scan()
  const key = `${route} [${state}]`
  const seen = new Set()
  report[key] = found.filter(([k, d]) => (seen.has(k + d) ? false : seen.add(k + d)))
  if (report[key].length) await win.screenshot({ path: join(out, `${slug(route)}--${state}.png`) })
  await win.keyboard.press('Escape')
  await win.waitForTimeout(200)
  await win.keyboard.press('Escape')
}

for (const r of LISTS) await visit(r, 'list')
// N opens the page's create form (or focuses its add field): what that form looks like.
for (const r of LISTS) {
  await visit(r, 'create', async () => {
    await win.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => undefined)
    await win.keyboard.press('n')
  })
}
for (const r of DETAILS) {
  await visit(r, 'view')
  await visit(r, 'edit', async () => {
    const edit = win.locator('[data-edit-detail]').first()
    if (!(await edit.count())) return false
    await edit.click().catch(() => undefined)
  })
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
let total = 0
for (const [r, list] of Object.entries(report)) {
  if (!list.length) continue
  total += list.length
  console.log(r, list.length, JSON.stringify(list.slice(0, 5)))
}
console.log(`[audit-scroll] ${total} findings → ${out}`)
await app.close()
