// UI audit: records with only their required fields → screenshots of lists and detail panes (are sparse records readable and clear?). Usage: npm run build; node scripts/audit-sparse.mjs <outDir> [dark|light]
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync } from 'fs'
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
  w.setSize(1440, 900)
  w.show()
})
await win.waitForLoadState('domcontentloaded')
const raw = (p, a) => win.evaluate(([p, a]) => window.vault.rpc(p, a), [p, a])
const rpc = async (p, a) => {
  const r = await raw(p, a)
  if (!r.ok) console.log('rpc fail', p, r.error)
  return r.data
}
await seed(raw)
await rpc('settings.update', { theme })

const plat = (await rpc('platforms.list', {}))[0]
const items = [
  ['idea', '/ideas', await rpc('ideas.create', { title: 'Порожня ідея' })],
  ['note', '/notes', await rpc('notes.create', { title: 'Порожня нотатка' })],
  ['bookmark', '/bookmarks', await rpc('bookmarks.create', { title: 'Порожня закладка' })],
  ['snippet', '/snippets', await rpc('snippets.create', { title: 'Порожній сніпет' })],
  ['library', '/libraries', await rpc('libraries.create', { name: 'empty-lib' })],
  ['fix', '/fixes', await rpc('fixes.create', { title: 'Порожня помилка' })],
  ['claude', '/claude', await rpc('claude.create', { kind: 'note', title: 'Порожній запис' })],
  ['case', '/freelance/portfolio', await rpc('cases.create', { title: 'Порожній кейс' })],
  ['template', '/freelance/templates', await rpc('templates.create', { title: 'Порожній шаблон', body: '' })],
  ['word', '/english', await rpc('english.create', { term: 'empty word' })],
  ['component', '/components', await rpc('components.create', { title: 'Порожній компонент' })]
]
const client = await rpc('clients.create', { name: 'Порожній клієнт' })
const project = await rpc('projects.create', { title: 'Порожній проєкт' })
const proposal = await rpc('proposals.create', { platformId: plat.id, jobTitle: 'Порожній відгук' })
const job = await rpc('jobs.create', { title: 'Порожня вакансія' })
const checklist = await rpc('checklists.create', { kind: 'template', title: 'Порожній чек-лист' })

for (const [name, route, rec] of items) {
  if (!rec) continue
  await win.evaluate((h) => { location.hash = `#${h}` }, `${route}?open=${rec.id}`)
  await win.waitForTimeout(900)
  await win.screenshot({ path: join(out, `${name}.png`) })
}
const pages = [
  ['client', `/clients/${client?.id}`],
  ['project', `/projects/${project?.id}`],
  ['clients-list', '/clients'],
  ['proposal', `/freelance/p/${plat.id}?open=${proposal?.id}`],
  ['job', `/jobs/applications?open=${job?.id}`],
  ['checklist', `/checklists/${checklist?.id}`],
  ['checklists-list', '/checklists']
]
for (const [name, route] of pages) {
  await win.evaluate((h) => { location.hash = `#${h}` }, route)
  await win.waitForTimeout(1000)
  await win.screenshot({ path: join(out, `${name}.png`) })
}
console.log('done')
await app.close()
