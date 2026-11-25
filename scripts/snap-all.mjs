/**
 * Screenshot EVERY state of the built app for a UI review round:
 *   <out>/<theme>/list/<route>.png       list pages on demo + sparse + extreme data
 *   <out>/<theme>/detail/<type>-<variant>.png   one record per type: demo | sparse | extreme
 *   <out>/<theme>/create/<route>.png     the create form/flow each page opens on «N»
 *   <out>/<theme>/edit/<type>.png        a demo record in edit mode («E»)
 *   <out>/<theme>/empty/<route>.png      list pages on a brand-new empty database
 *   <out>/report.json                    console errors per screen
 * Usage: npm run build; node scripts/snap-all.mjs <out> [--themes=dark,light] [--only=list,detail,create,edit,empty]
 */
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { ENTITY_META, ENTITY_TYPES } from '../src/shared/entity-types.ts'
import { seed } from './seed.mjs'
import { demoIds, hideMoodboards, makeRpc, seedDesigns, seedManyMoodboards, seedMonsters, seedSparse } from './fixtures.mjs'

const out = resolve(process.argv[2] ?? 'snap-all')
const opt = (name, def) => (process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def).split(',')
const THEMES = opt('themes', 'dark,light')
const ONLY = new Set(opt('only', 'list,detail,create,edit,empty'))

const LIST_ROUTES = ['/', '/review', '/ideas', '/boards', '/calendar', '/checklists', '/freelance', '/freelance/templates',
  '/freelance/portfolio', '/freelance/flags', '/freelance/goals', '/freelance/calculator', '/finance', '/finance/income',
  '/finance/expenses', '/finance/withdrawals', '/clients', '/notes', '/claude', '/snippets', '/components', '/libraries',
  '/fixes', '/designs', '/bookmarks', '/english', '/english/review', '/jobs', '/jobs/applications', '/jobs/interviews',
  '/jobs/companies', '/jobs/resumes', '/jobs/questions', '/jobs/questions/practice', '/jobs/stats', '/jobs/boards', '/knowledge',
  '/dev', '/dev/github', '/tags', '/trash', '/settings', '/guide']

const report = {}
const name = (route) => route.replace(/[/?=&]+/g, '_').replace(/^_|_$/g, '') || 'home'

async function launch(theme) {
  const app = await electron.launch({
    args: [resolve('.'), `--user-data-dir=${mkdtempSync(join(tmpdir(), 'vault-snap-'))}`],
    env: { ...process.env, NODE_ENV: 'production' }
  })
  const win = await app.firstWindow()
  const errors = []
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)))
  win.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setSize(1440, 900)
    w.show()
  })
  await win.waitForLoadState('domcontentloaded')
  const raw = (p, a) => win.evaluate(([p, a]) => window.vault.rpc(p, a), [p, a])
  const rpc = makeRpc(raw, 'snap-all')
  // A free global shortcut first: the installed Vault may hold the default one.
  await rpc('settings.update', { quickAddShortcut: 'CommandOrControl+Alt+Shift+F8', capturePort: 47800 + Math.floor(Math.random() * 100) })
  await rpc('settings.update', { theme })
  return { app, win, raw, rpc, errors }
}

async function shot(ctx, dir, file, key) {
  mkdirSync(dir, { recursive: true })
  await ctx.win.screenshot({ path: join(dir, `${file}.png`) })
  if (ctx.errors.length) report[key] = [...ctx.errors]
  ctx.errors.length = 0
}

async function go(ctx, route, wait = 900) {
  await ctx.win.keyboard.press('Escape').catch(() => {})
  await ctx.win.evaluate((h) => { location.hash = `#${h}` }, route)
  await ctx.win.waitForTimeout(wait)
}

for (const theme of THEMES) {
  const base = join(out, theme)
  if (['list', 'detail', 'create', 'edit'].some((k) => ONLY.has(k))) {
    const ctx = await launch(theme)
    await seed(ctx.raw)
    const sparse = await seedSparse(ctx.rpc)
    const extreme = await seedMonsters(ctx.rpc)
    await seedDesigns(ctx.win, 6)
    const skip = new Set([...Object.values(sparse), ...Object.values(extreme)])
    const demo = await demoIds(ctx.rpc, skip)
    await ctx.rpc('settings.update', { theme })

    if (ONLY.has('list'))
      for (const r of LIST_ROUTES) {
        await go(ctx, r, 1100)
        await shot(ctx, join(base, 'list'), name(r), `${theme} list ${r}`)
      }

    if (ONLY.has('list')) {
      // The «Добірки» row over the gallery: none yet (one line with «Нова добірка») and a full row («+N», arrows).
      const restore = await hideMoodboards(ctx.rpc)
      await go(ctx, '/designs', 1100)
      await shot(ctx, join(base, 'list'), 'designs_no-boards', `${theme} list /designs no boards`)
      await restore()
      const many = await seedManyMoodboards(ctx.rpc)
      await go(ctx, '/designs', 1100)
      await shot(ctx, join(base, 'list'), 'designs_many-boards', `${theme} list /designs many boards`)
      for (const id of many) await ctx.rpc('moodboards.remove', id)
    }

    if (ONLY.has('list')) {
      // «Налаштування → Меню»: the section with a group unfolded, and home / the sidebar with sections hidden.
      await go(ctx, '/settings#menu', 1100)
      await ctx.win.getByRole('button', { name: 'Показати пункти розділу «Робота»' }).click().catch(() => {})
      await ctx.win.waitForTimeout(400)
      await shot(ctx, join(base, 'list'), 'settings_menu', `${theme} list /settings#menu`)
      await ctx.rpc('settings.update', { hiddenNavHubs: ['freelance', 'jobs', 'finance', 'knowledge'], hiddenNavItems: ['/calendar'] })
      await go(ctx, '/settings#menu', 1100)
      await shot(ctx, join(base, 'list'), 'settings_menu-hidden', `${theme} list /settings#menu hidden`)
      await go(ctx, '/', 1100)
      await shot(ctx, join(base, 'list'), 'home_hidden-sections', `${theme} list / hidden sections`)
      await ctx.rpc('settings.update', { hiddenNavHubs: [], hiddenNavItems: [] })

      // Folded sidebar (Ctrl+B): the strip of icons, and the «Фриланс» flyout.
      await ctx.win.keyboard.press('Control+b')
      for (const r of ['/', '/designs', '/boards', '/jobs/applications', '/finance']) {
        await go(ctx, r, 1100)
        await shot(ctx, join(base, 'list'), `collapsed_${name(r)}`, `${theme} list ${r} collapsed`)
      }
      await ctx.win.locator('[data-slot=app-sidebar]').getByRole('button', { name: 'Фриланс' }).click().catch(() => {})
      await ctx.win.waitForTimeout(400)
      await shot(ctx, join(base, 'list'), 'collapsed_flyout-freelance', `${theme} list collapsed flyout`)
      await ctx.win.keyboard.press('Escape')
      await ctx.win.keyboard.press('Control+b')
    }

    if (ONLY.has('detail'))
      for (const type of ENTITY_TYPES) {
        for (const [variant, ids] of [['demo', demo], ['sparse', sparse], ['extreme', extreme]]) {
          if (!ids[type]) continue
          await go(ctx, ENTITY_META[type].route(ids[type]), 1100)
          await shot(ctx, join(base, 'detail'), `${type}-${variant}`, `${theme} detail ${type} ${variant}`)
        }
      }

    if (ONLY.has('edit'))
      for (const type of ENTITY_TYPES) {
        if (!demo[type]) continue
        await go(ctx, ENTITY_META[type].route(demo[type]), 1000)
        await ctx.win.keyboard.press('e')
        await ctx.win.waitForTimeout(600)
        await shot(ctx, join(base, 'edit'), type, `${theme} edit ${type}`)
        await ctx.win.keyboard.press('Escape')
        await ctx.win.waitForTimeout(300)
        // «Зберегти зміни?» shouldn't appear (nothing changed); close it if it did.
        await ctx.win.keyboard.press('Escape')
      }

    if (ONLY.has('create'))
      for (const r of LIST_ROUTES) {
        if (r === '/' || r === '/settings' || r === '/guide' || r === '/trash') continue
        await go(ctx, r, 900)
        await ctx.win.mouse.click(5, 450).catch(() => {}) // focus the page, not an input
        await ctx.win.keyboard.press('n')
        await ctx.win.waitForTimeout(900)
        await shot(ctx, join(base, 'create'), name(r), `${theme} create ${r}`)
      }
    await ctx.app.close()
  }

  if (ONLY.has('empty')) {
    const ctx = await launch(theme)
    for (const r of LIST_ROUTES) {
      await go(ctx, r, 1500)
      await shot(ctx, join(base, 'empty'), name(r), `${theme} empty ${r}`)
    }
    await ctx.app.close()
  }
  console.log(`[snap-all] ${theme} done`)
}

writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
const bad = Object.keys(report).length
console.log(bad ? `[snap-all] console errors on ${bad} screen(s) — see report.json` : '[snap-all] no console errors')
