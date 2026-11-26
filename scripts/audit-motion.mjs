// Motion audit (docs/design-system.md §13 «Движение»): drives the built app on demo data and checks, frame by frame
// (requestAnimationFrame), that enter/exit animations play, closing things stay mounted until their exit ends, nothing
// blanks or jumps on the way, data refetches and scrolling replay nothing, and «reduce motion» leaves no real
// animation. Prints ✓/✗ per check. Usage: npm run build; node scripts/audit-motion.mjs [outDir] [light|dark]
// Playwright emulates light + «no preference» by default: the checks set the media they need themselves.
import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { seed } from './seed.mjs'
import { makeRpc } from './fixtures.mjs'

const out = process.argv[2] ?? 'audit-motion'
const theme = process.argv[3] ?? 'light'
mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: [resolve('.'), `--user-data-dir=${mkdtempSync(join(tmpdir(), 'vault-motion-'))}`],
  env: { ...process.env, NODE_ENV: 'production', VAULT_NO_NOTIFY: '1' }
})
const win = await app.firstWindow()
win.setDefaultTimeout(6000)
const errors = []
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
win.on('pageerror', (e) => errors.push(String(e)))
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.setSize(1440, 900)
  w.show()
  w.focus()
})
await win.waitForLoadState('domcontentloaded')
const raw = (p, a) => win.evaluate(([p, a]) => window.vault.rpc(p, a), [p, a])
const rpc = makeRpc(raw, 'audit-motion')
await rpc('settings.update', { theme, quickAddShortcut: 'CommandOrControl+Alt+Shift+F9' })
await seed(raw)
const pinned = []
for (let i = 0; i < 10; i++) {
  const n = await rpc('notes.create', { title: `Закріплена ${i}` })
  pinned.push(n.id)
  await rpc('pins.toggle', { ref: { type: 'note', id: n.id }, kind: 'pin' })
}
const long = await rpc('notes.create', {
  title: 'Довга нотатка',
  body: Array.from({ length: 80 }, (_, k) => `Рядок ${k} довгого тексту нотатки`).join('\n\n')
})
for (const n of ['Майданчик A', 'Майданчик B']) await rpc('jobs.createBoard', { name: n, color: '#6b8c00' })

// ── frame recorder ──
// Every frame: rect/opacity/text length of each watched selector, the running animations, removed nodes.
await win.evaluate(() => {
  window.__motion = (sels, ms) =>
    new Promise((res) => {
      const frames = []
      const t0 = performance.now()
      const tick = () => {
        const f = { t: performance.now() - t0, anims: [], els: {} }
        for (const a of document.getAnimations()) {
          const timing = a.effect?.getComputedTiming() ?? {}
          f.anims.push({
            name: a.animationName ?? (a.transitionProperty ? `tr:${a.transitionProperty}` : 'waapi'),
            slot: a.effect?.target?.getAttribute?.('data-slot') ?? '',
            duration: timing.duration,
            iterations: timing.iterations
          })
        }
        for (const [k, sel] of Object.entries(sels)) {
          const el = document.querySelector(sel)
          if (!el) {
            f.els[k] = null
            continue
          }
          const r = el.getBoundingClientRect()
          f.els[k] = { y: r.y, w: r.width, h: r.height, op: +getComputedStyle(el).opacity, txt: (el.textContent || '').length }
        }
        frames.push(f)
        if (f.t < ms) requestAnimationFrame(tick)
        else res(frames)
      }
      requestAnimationFrame(tick)
    })
})
const record = async (sels, action, ms = 700) => {
  const p = win.evaluate(([s, m]) => window.__motion(s, m), [sels, ms])
  await action()
  return p
}
const go = async (route, wait = 1200) => {
  await win.evaluate((h) => {
    location.hash = `#${h}`
  }, route)
  await win.waitForTimeout(wait)
}
const blur = () => win.locator('main h1').first().click({ position: { x: 2, y: 2 } }).catch(() => {})
const ran = (frames, name) => frames.some((f) => f.anims.some((a) => a.name === name))
const firstT = (frames, pred) => frames.find(pred)?.t
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
/** Run a step; a failed locator is a ✗, not the end of the audit. */
const step = async (name, fn) => {
  try {
    await fn()
  } catch (e) {
    check(name, false, `step failed: ${String(e.message || e).split('\n')[0]}`)
  }
}
/** Text of a closing overlay must not drop (blank or switched body) while it fades. */
const keptText = (frames, key) => {
  const seen = frames.map((f) => f.els[key]).filter(Boolean)
  return seen.length > 0 && seen.every((e) => e.txt >= seen[0].txt * 0.9)
}
const PANE = '[data-detail-mode]'
const ROW = '[data-row-key]'

// ── page transition ──
await go('/notes')
await step('route: page fades in', async () => {
  const fr = await record({}, () => go('/ideas', 0), 400)
  check('route: page fades in (animate-page)', ran(fr, 'page'))
})
await win.waitForTimeout(900)

// ── record pane (MasterDetail / DetailPane) ──
await step('record open', async () => {
  const fr = await record({ pane: PANE, row: ROW }, () => win.locator(`${ROW} button`).first().click(), 500)
  const narrow = firstT(fr, (f) => f.els.row && f.els.row.w < 700)
  const shown = firstT(fr, (f) => f.els.pane)
  check('record open: pane enters (animate-pane)', ran(fr, 'pane'))
  check('record open: list narrows in the same frame the pane appears', narrow !== undefined && narrow === shown, `narrow ${narrow?.toFixed(0)}ms, pane ${shown?.toFixed(0)}ms`)
})
await win.waitForTimeout(400)
await step('record switch', async () => {
  const fr = await record({ pane: PANE }, () => win.locator(`${ROW} button`).nth(1).click(), 450)
  const blank = fr.filter((f) => !f.els.pane).length
  check('record switch: no blank pane between records', blank === 0, `${blank} blank frame(s)`)
})
await win.waitForTimeout(400)
await step('record close', async () => {
  await blur()
  const fr = await record({ pane: PANE, row: ROW }, () => win.keyboard.press('Escape'), 500)
  const gone = firstT(fr, (f) => !f.els.pane)
  const wide = firstT(fr, (f) => f.els.row && f.els.row.w > 900)
  check('record close: exit plays (animate-pane-out)', ran(fr, 'pane-out'))
  check('record close: pane stays for its exit (≥140ms)', gone !== undefined && gone >= 140, `gone at ${gone?.toFixed(0)}ms`)
  check('record close: list widens once the pane is gone', wide !== undefined && Math.abs(wide - gone) < 20, `pane gone ${gone?.toFixed(0)}ms, list wide ${wide?.toFixed(0)}ms`)
})
await step('record trash', async () => {
  await win.locator(`${ROW} button`).nth(2).click()
  await win.waitForTimeout(500)
  const fr = await record({ pane: PANE, row: ROW }, () => win.getByRole('button', { name: 'У кошик' }).first().click(), 900)
  const hidden = firstT(fr, (f) => f.els.pane && f.els.pane.op < 0.02)
  const wide = firstT(fr, (f) => f.els.row && f.els.row.w > 900)
  check('trash: pane and row leave (animate-leave)', ran(fr, 'leave'))
  // Before the fix the empty column stood ~300ms (the delete request, then a second exit); now it is the request alone.
  check('trash: the column closes soon after the pane faded', wide !== undefined && hidden !== undefined && wide - hidden < 250, `faded ${hidden?.toFixed(0)}ms, list wide ${wide?.toFixed(0)}ms`)
})
await win.waitForTimeout(600)
await step('list cascade', async () => {
  await win.locator('[data-page-search]').fill('Курс')
  await win.waitForTimeout(700)
  const fr = await record({}, () => win.locator('[data-page-search]').fill(''), 800)
  check('list: rows cascade in after a new filter (fade-up)', ran(fr, 'fade-up'))
})

// ── overlays ──
const overlay = async (name, open, close, sel) => {
  await step(name, async () => {
    const fin = await record({ c: sel }, open, 400)
    check(`${name}: enter plays`, ran(fin, 'enter'))
    await win.waitForTimeout(200)
    const fout = await record({ c: sel }, close, 450)
    const gone = firstT(fout, (f) => !f.els.c)
    check(`${name}: exit plays and the content stays until it ends`, ran(fout, 'exit') && gone !== undefined && gone >= 120, `gone at ${gone?.toFixed(0)}ms`)
    check(`${name}: content doesn't blank while closing`, keptText(fout, 'c'))
  })
  await win.waitForTimeout(250)
}
await blur()
await overlay('palette Ctrl+K', () => win.keyboard.press('Control+k'), () => win.keyboard.press('Escape'), '[data-slot=dialog-content]')
await overlay('quick add Ctrl+N', () => win.keyboard.press('Control+n'), () => win.keyboard.press('Escape'), '[data-slot=dialog-content]')
await overlay('context menu', () => win.locator('[data-slot=app-sidebar] a[href="#/ideas"]').first().click({ button: 'right' }), () => win.keyboard.press('Escape'), '[data-slot=context-menu-content]')
const boards = await rpc('boards.list', {})
const board = (boards?.items ?? boards)?.[0]
if (board) {
  await go(`/boards/${board.id}`, 1500)
  await overlay('card sheet', () => win.locator('[aria-roledescription="sortable"]').first().click(), () => win.keyboard.press('Escape'), '[data-slot=sheet-content]')
}
await go('/ideas')
await overlay('popover (tag filter)', () => win.locator('main button', { hasText: /^Мітка$/ }).first().click(), () => win.keyboard.press('Escape'), '[data-slot=popover-content]')
await step('select', async () => {
  await win.locator(`${ROW} button`).first().click()
  await win.waitForTimeout(500)
  await win.keyboard.press('e')
  await win.waitForTimeout(400)
})
await overlay('select', () => win.locator(`${PANE} [data-slot=select-trigger]`).first().click(), () => win.keyboard.press('Escape'), '[data-slot=select-content]')
await win.keyboard.press('Escape')
await win.waitForTimeout(300)

// ── collapsible (FAQ) ──
await go('/guide', 1500)
await step('collapsible', async () => {
  const root = win.locator('[id^=faq-]').first()
  await root.scrollIntoViewIfNeeded()
  const sel = `#${await root.getAttribute('id')}`
  const btn = win.locator(`${sel} button`).first()
  const fin = await record({ c: `${sel} [data-slot=collapsible-content]` }, () => btn.click(), 450)
  const hs = fin.map((f) => f.els.c?.h).filter((h) => h !== undefined)
  check('collapsible: opens by height from 0', ran(fin, 'collapsible-down') && hs.length > 3 && hs[0] < 5 && hs.at(-1) > 20, `${hs[0]?.toFixed(0)} → ${hs.at(-1)?.toFixed(0)}px`)
  const fout = await record({ c: `${sel} [data-slot=collapsible-content]` }, () => btn.click(), 450)
  check('collapsible: closes by height', ran(fout, 'collapsible-up'))
})

// ── presence list: home «Ще N» / «Згорнути» ──
await go('/notes', 600)
await go('/', 1800)
await step('presence list', async () => {
  await win.evaluate(() => {
    const t = [...document.querySelectorAll('main *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Закріплено')
    t?.closest('[data-slot=card]')?.setAttribute('data-motion', 'pins')
  })
  const sels = { card: '[data-motion=pins]', row8: '[data-motion=pins] [class*=interpolate-size]:nth-child(8)' }
  const fin = await record(sels, () => win.locator('[data-motion=pins] button', { hasText: /^Ще \d/ }).click(), 450)
  const h = fin.map((f) => f.els.row8?.h).filter((x) => x !== undefined)
  const card = fin.map((f) => f.els.card?.h).filter(Boolean)
  const step1 = Math.max(...card.slice(1).map((v, i) => v - card[i]))
  check('presence: unfolding row grows from 0', h.length > 3 && h[0] < 5, `first frame ${h[0]?.toFixed(1)}px`)
  check('presence: card grows without a jump', step1 < 80, `largest step ${step1.toFixed(0)}px`)
  const fout = await record(sels, () => win.locator('[data-motion=pins] button', { hasText: 'Згорнути' }).click(), 450)
  const hf = fout.map((f) => f.els.row8?.h).filter((x) => x !== undefined)
  check('presence: folding row shrinks to 0 before it goes', hf.length > 3 && hf.at(-1) < 1)
})

// ── «Показати повністю» / «Згорнути» (ShowMore) ──
await go(`/notes?open=${long.id}`, 1500)
await step('show more', async () => {
  await win.getByRole('button', { name: 'Показати повністю' }).first().click()
  await win.waitForTimeout(500)
  const less = win.locator('[data-detail-body] button', { hasText: 'Згорнути' }).first()
  await less.scrollIntoViewIfNeeded()
  await win.waitForTimeout(200)
  const fr = await record({ btn: '[data-detail-body] button[aria-expanded]' }, () => less.click(), 450)
  const ys = fr.map((f) => f.els.btn?.y).filter((y) => y !== undefined)
  const jump = Math.max(...ys.slice(1).map((v, i) => Math.abs(v - ys[i])))
  check('show more: fold plays (Web Animations)', fr.some((f) => f.anims.some((a) => a.name === 'waapi')))
  check('show more: the reading position does not jump', jump < 100, `largest step ${jump.toFixed(0)}px`)
})

// ── drag and drop: the dropped order stays ──
await go('/jobs/boards', 1500)
await step('reorder', async () => {
  const handles = win.locator('[aria-label="Перетягнути"]')
  const a = await handles.nth(0).boundingBox()
  const b = await handles.nth(2).boundingBox()
  await win.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await win.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await win.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + ((b.y - a.y + 10) * i) / 12)
    await win.waitForTimeout(16)
  }
  await win.waitForTimeout(150)
  const orders = win.evaluate(() =>
    new Promise((res) => {
      const seen = []
      const t0 = performance.now()
      const tick = () => {
        const s = [...document.querySelectorAll('[aria-label="Перетягнути"]')]
          .map((h) => h.closest('[data-slot=card]')?.querySelector('input')?.value)
          .join('|')
        if (seen.at(-1) !== s) seen.push(s)
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick)
        else res(seen)
      }
      requestAnimationFrame(tick)
    })
  )
  await win.mouse.up()
  const seen = await orders
  check('reorder: the dropped order never flips back', seen.length === 1, `${seen.length} order(s) after the drop`)
})

// ── nothing replays on a data refetch or scroll ──
for (const route of ['/', '/jobs', '/finance', '/designs']) {
  await go(route, 1500)
  await step(`refetch ${route}`, async () => {
    await win.keyboard.press('Control+n')
    await win.waitForTimeout(400)
    await win.keyboard.type(`Ідея з аудиту ${route}`)
    const fr = await record({}, () => win.keyboard.press('Enter'), 1200)
    const replay = fr.flatMap((f) => f.anims).filter((a) => ['fade-up', 'page', 'pane'].includes(a.name))
    check(`refetch ${route}: no entrance animation replays`, replay.length === 0, replay[0]?.name ?? '')
  })
}
await go('/designs', 1500)
await step('scroll', async () => {
  await win.mouse.move(800, 500)
  const fr = await record({}, () => win.mouse.wheel(0, 2500), 700)
  check('scroll: rows/cards appear without entrance animation', !ran(fr, 'fade-up'))
})

// ── reduce motion ──
await win.emulateMedia({ reducedMotion: 'reduce' })
const realAnims = (fr) =>
  [...new Set(fr.flatMap((f) => f.anims).filter((a) => a.duration > 1 || a.iterations === Infinity).map((a) => `${a.name}${a.slot ? `@${a.slot}` : ''}`))]
const reduced = async (name, action, ms = 600) => {
  await step(`reduce: ${name}`, async () => {
    const r = realAnims(await record({}, action, ms))
    check(`reduce: ${name} — no real animation`, r.length === 0, r.join(', '))
  })
}
await go('/notes', 1200)
await reduced('route change', () => go('/ideas', 0))
await win.waitForTimeout(800)
await reduced('record open', () => win.locator(`${ROW} button`).first().click())
await step('reduce: record close', async () => {
  await blur()
  const fr = await record({ pane: PANE }, () => win.keyboard.press('Escape'), 300)
  const gone = firstT(fr, (f) => !f.els.pane)
  check('reduce: record close — the pane goes at once', gone !== undefined && gone < 60, `gone at ${gone?.toFixed(0)}ms`)
})
await reduced('palette', async () => {
  await win.keyboard.press('Control+k')
  await win.waitForTimeout(250)
  await win.keyboard.press('Escape')
})
await reduced('skeleton pulse / spinner', () =>
  win.evaluate(() => {
    const d = document.createElement('div')
    d.innerHTML = '<div class="animate-pulse">x</div><div class="animate-spin">y</div>'
    document.body.append(d)
    setTimeout(() => d.remove(), 300)
  }), 300)
if (board) {
  await go(`/boards/${board.id}`, 1500)
  await step('reduce: kanban drop', async () => {
    const cards = win.locator('[aria-roledescription="sortable"]')
    const a = await cards.nth(0).boundingBox()
    const c = await cards.nth(1).boundingBox()
    await win.mouse.move(a.x + 20, a.y + 10)
    await win.mouse.down()
    for (let i = 1; i <= 10; i++) {
      await win.mouse.move(a.x + 20, a.y + 10 + ((c.y - a.y + 10) * i) / 10)
      await win.waitForTimeout(16)
    }
    await win.waitForTimeout(150)
    const r = realAnims(await record({}, () => win.mouse.up(), 500))
    check('reduce: kanban drop — no real animation', r.length === 0, r.join(', '))
  })
}

// ── startup screen (#splash): no emulation, so prefers-color-scheme follows the app theme like in real use ──
const splash = async (label) => {
  await win.reload({ waitUntil: 'commit' })
  return win.evaluate(
    () =>
      new Promise((res) => {
        const rows = []
        const tick = () => {
          const s = document.getElementById('splash')
          const note = s?.querySelector('.note')
          rows.push({
            t: performance.now(),
            on: !!s && +getComputedStyle(s).opacity > 0.01,
            note: note ? +getComputedStyle(note).opacity : 0,
            bg: s ? getComputedStyle(s).backgroundColor : '',
            frame: getComputedStyle(document.documentElement).getPropertyValue('--frame').trim(),
            dark: document.documentElement.classList.contains('dark')
          })
          if (s) requestAnimationFrame(tick)
          else res(rows)
        }
        tick()
      })
  ).then((rows) => {
    const early = rows.filter((r) => r.on && r.t < 1300)
    check(`splash (${label}): note hidden in the first 1.3 s`, early.every((r) => r.note < 0.05), `max opacity ${Math.max(0, ...early.map((r) => r.note)).toFixed(2)}`)
    const last = rows.filter((r) => r.on && r.dark !== undefined).at(-1)
    const darkBg = last && /rgb\((\d+)/.exec(last.bg)?.[1] < 60
    check(`splash (${label}): background matches the theme`, !!last && darkBg === last.dark, `${last?.bg} dark=${last?.dark}`)
  })
}
await step('splash', async () => {
  await win.emulateMedia({ colorScheme: null, reducedMotion: null })
  await splash('as is')
  await win.emulateMedia({ colorScheme: null, reducedMotion: 'reduce' })
  await splash('reduce')
})

const real = errors.filter((e) => !/Failed to load resource/.test(e))
check('console: no errors (ResizeObserver loop, view transition…)', real.length === 0, real.slice(0, 3).join(' | ').slice(0, 300))
const failed = results.filter((r) => !r.ok)
writeFileSync(join(out, `motion-${theme}.json`), JSON.stringify(results, null, 1))
console.log(failed.length ? `\n${failed.length} of ${results.length} check(s) failed` : `\nall ${results.length} checks passed`)
await app.close()
