// UI audit: extreme data (500-char titles, unbroken words, huge sums) on every route → prints elements that spill out of their box or get cut mid-word, saves screenshots. Usage: npm run build; node scripts/audit-overflow.mjs <outDir> [dark|light]
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { seed } from './seed.mjs'

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
const rpc = async (p, a) => {
  const r = await win.evaluate(([p, a]) => window.vault.rpc(p, a), [p, a])
  if (!r.ok) console.log('rpc fail', p, r.error)
  return r.data
}
await seed(raw)
await rpc('settings.update', { theme })

// ── extreme data ──
const WORD = 'Суперкалiфраджилiстiкекспiалiдоцiозний'.repeat(4) // one 150+ char word
const LONG = `${WORD} ${'довга назва '.repeat(30)}`.slice(0, 480)
const URL = `https://example.com/${'very-long-path-segment-'.repeat(12)}?q=${'x'.repeat(80)}`
const t = Date.now()
const tag = await rpc('tags.create', { name: 'дуже-довга-мітка-без-пробілів-аааааааааааа'.slice(0, 60), color: '#7c8cf8' })
const tagIds = [tag.id]
await rpc('ideas.create', { title: LONG, body: WORD, tagIds })
const board = (await rpc('boards.list', {}))[0]
const col = (await rpc('boards.details', board.id)).columns[0]
await rpc('cards.create', { boardId: board.id, columnId: col.id, title: LONG, description: WORD, dueAt: t, tagIds })
await rpc('notes.create', { title: LONG, folder: WORD.slice(0, 90), body: WORD })
await rpc('bookmarks.create', { title: LONG, url: URL, notes: WORD, tagIds })
await rpc('snippets.create', { title: LONG, code: WORD, tagIds })
await rpc('libraries.create', { name: WORD.slice(0, 190), notes: WORD, tagIds })
await rpc('fixes.create', { title: LONG, problem: WORD })
await rpc('claude.create', { kind: 'note', title: LONG, content: WORD })
await rpc('english.create', { term: WORD.slice(0, 290), translation: WORD })
await rpc('events.create', { title: LONG, startAt: t + 3600000 })
const client = await rpc('clients.create', { name: WORD.slice(0, 190), company: WORD.slice(0, 190), currency: 'USD' })
const project = await rpc('projects.create', { clientId: client.id, title: LONG, billing: 'fixed', fixedPrice: 99999999, currency: 'USD' })
await rpc('payments.create', { projectId: project.id, amount: 99999999, currency: 'USD', status: 'paid', paidAt: t })
await rpc('credentials.create', { projectId: project.id, label: WORD.slice(0, 190), url: URL, login: WORD, secret: 'x' })
await rpc('time.create', { projectId: project.id, startedAt: t - 7200000, endedAt: t - 3600000, description: WORD })
const plat = (await rpc('platforms.list', {}))[0]
await rpc('proposals.create', { platformId: plat.id, jobTitle: LONG, niche: WORD.slice(0, 90), coverLetter: WORD, credits: 16, sentAt: t })
await rpc('templates.create', { title: LONG, body: `${WORD} {${'variable_name_'.repeat(6)}}` })
await rpc('cases.create', { title: LONG, niche: WORD.slice(0, 90), stack: WORD.slice(0, 190) })
await rpc('finance.createSubscription', { title: LONG.slice(0, 290), amount: 99999999, billingDay: 3 })
await rpc('finance.createExpense', { title: LONG.slice(0, 290), amount: 99999999, at: t })
await rpc('checklists.create', { kind: 'template', title: LONG, description: WORD })
const co = await rpc('jobs.createCompany', { name: WORD.slice(0, 190), stack: WORD.slice(0, 190) })
await rpc('jobs.create', { title: LONG, companyId: co.id, salaryMin: 99999999, salaryMax: 99999999, description: WORD })
await rpc('components.create', { title: LONG, description: WORD, code: '<div/>' })

const ROUTES = ['/', '/ideas', '/boards', '/boards/{board}', '/calendar', '/checklists', '/freelance', '/freelance/p/{platform}',
  '/freelance/templates', '/freelance/portfolio', '/freelance/flags', '/freelance/goals', '/freelance/calculator', '/finance',
  '/finance/income', '/finance/expenses', '/finance/withdrawals', '/clients', '/clients/{client}', '/projects/{project}',
  '/notes', '/claude', '/snippets', '/components', '/libraries', '/fixes', '/designs', '/bookmarks', '/english', '/jobs',
  '/jobs/applications', '/jobs/interviews', '/jobs/companies', '/jobs/resumes', '/jobs/questions', '/jobs/stats',
  '/knowledge', '/review', '/tags', '/trash', '/settings']
const ids = { board: board.id, platform: plat.id, client: client.id, project: project.id }

const report = {}
for (const r of ROUTES) {
  const route = r.replace(/\{(\w+)\}/g, (_, k) => ids[k])
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
  if (report[route].length) await win.screenshot({ path: join(out, `${r.replace(/[/{}]/g, '_')}.png`) })
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
for (const [r, list] of Object.entries(report)) if (list.length) console.log(r, list.length, JSON.stringify(list.slice(0, 6)))
await app.close()
