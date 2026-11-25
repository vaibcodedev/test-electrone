/**
 * Screenshots of the Chrome extension popup and options page in every state, rendered in Electron with a
 * stubbed `chrome.*` API and a fake Vault bridge (no browser, no running Vault needed):
 *   <out>/<theme>/popup-<target>.png              each target type, connected (full height)
 *   <out>/<theme>/popup-<target>-600.png          the same in Chrome's 600px popup cap (warns if the footer leaves it)
 *   <out>/<theme>/popup-nokey | offline | unauthorized | timeout .png   connection problems
 *   <out>/<theme>/popup-long | selection | recent | focus .png
 *   <out>/<theme>/popup-restricted | restricted-design | restricted-switch .png   chrome:// page (design → bookmark)
 *   <out>/<theme>/popup-area | area-error .png      back after «Виділити область», a failed selection
 *   <out>/<theme>/popup-saved | saved-warning | back .png   after «Зберегти» (also without the picture), «Зберегти ще»
 *   <out>/<theme>/popup-error | tags-error .png     the server refused the title / the tags
 *   <out>/<theme>/options | options-nokey | options-offline | options-badport .png
 * Usage: node scripts/snap-extension.mjs <out> [--themes=dark,light]
 */
import { _electron as electron } from 'playwright-core'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'snap-extension')
const THEMES = (
  process.argv.find((a) => a.startsWith('--themes='))?.split('=')[1] ?? 'dark,light'
).split(',')
const work = mkdtempSync(join(tmpdir(), 'vault-ext-'))
const ext = join(work, 'ext')
cpSync(resolve('extension'), ext, { recursive: true })

/**
 * chrome.* + fetch stub; the state comes from the page URL:
 * key=0 · ping=offline|401|timeout · url · title · sel · recent=a,b · area=1 · areaError=1 · capture=error|tags|warning
 */
writeFileSync(
  join(ext, 'stub.js'),
  `
const q = new URLSearchParams(location.search)
const tabUrl = q.get('url') || 'https://dribbble.com/shots/123-dashboard'
const store = q.get('key') === '0' ? {} : { key: 'test-key', port: 47219 }
if (q.get('recent')) store.recentTags = q.get('recent').split(',')
const session = {}
const area = (s) => ({
  get: async (k) => { const o = {}; for (const x of k == null ? Object.keys(s) : [].concat(k)) if (x in s) o[x] = s[x]; return o },
  set: async (o) => { Object.assign(s, o) },
  remove: async (k) => { for (const x of [].concat(k)) delete s[x] }
})
function shot() {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 720
  const g = c.getContext('2d'); g.fillStyle = '#101216'; g.fillRect(0, 0, 1280, 720)
  g.fillStyle = '#d4f542'; g.fillRect(80, 90, 460, 64); g.fillStyle = '#2a2d33'
  for (let i = 0; i < 3; i++) g.fillRect(80 + i * 380, 220, 350, 260)
  return c.toDataURL('image/png')
}
if (q.get('area')) session['area:7'] = { dataUrl: shot(), url: tabUrl, at: Date.now() }
if (q.get('areaError')) session['area-error:7'] = { url: tabUrl, at: Date.now() }
window.chrome = {
  tabs: {
    query: async () => [{ id: 7, windowId: 1, url: tabUrl, title: q.get('title') || 'Dashboard UI concept — Dribbble' }],
    captureVisibleTab: async () => shot()
  },
  storage: { local: area(store), session: area(session) },
  scripting: { executeScript: async () => [{ result: q.get('sel') || '' }] },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, openPopup: async () => {} },
  runtime: {
    openOptionsPage() {},
    // The popup saves through the service worker; run the same code here.
    sendMessage: async (msg) => (msg?.type === 'vault-capture' ? (await import('./shared.js')).sendCapture(msg.tabId, msg.body) : {}),
    onMessage: { addListener() {} }
  }
}
const realFetch = window.fetch
window.fetch = async (url, init) => {
  if (!String(url).startsWith('http://127.0.0.1')) return realFetch(url, init)
  if (q.get('ping') === 'offline') throw new TypeError('Failed to fetch')
  if (q.get('ping') === 'timeout') throw new DOMException('t', 'TimeoutError')
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (q.get('ping') === '401') return json(401, { ok: false, error: 'Ключ не підходить. Скопіюйте новий у Vault: Налаштування → «Розширення для Chrome».' })
  if (String(url).endsWith('/ping')) return json(200, { ok: true, app: 'vault', version: '0.1.0' })
  if (q.get('capture') === 'error') return json(400, { ok: false, error: 'Назва: занадто довго — максимум 500 символів' })
  if (q.get('capture') === 'tags') return json(400, { ok: false, error: 'Мітки: занадто довго — максимум 60 символів' })
  const body = JSON.parse(init?.body || '{}')
  const section = { design: 'Дизайни', bookmark: 'Закладки', library: 'JS-бібліотеки', component: 'Компоненти', application: 'Вакансії' }[body.target]
  const warning = q.get('capture') === 'warning' ? 'Запис збережено, але скриншот додати не вдалося.' : undefined
  return json(200, { ok: true, type: body.target, id: 'x', title: body.title || 'Без назви', section, warning })
}
`
)
for (const page of ['popup.html', 'options.html']) {
  const html = readFileSync(join(ext, page), 'utf8')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace(
      /<script type="module" src="(\w+)\.js"><\/script>/,
      '<script src="stub.js"></script><script type="module" src="$1.js"></script>'
    )
  writeFileSync(join(ext, page.replace('.html', '.test.html')), html)
}
writeFileSync(
  join(work, 'main.cjs'),
  `
const { app, BrowserWindow, nativeTheme } = require('electron')
app.whenReady().then(() => {
  nativeTheme.themeSource = process.env.THEME || 'dark'
  const w = new BrowserWindow({ width: Number(process.env.W || 420), height: 640, show: false, useContentSize: true })
  w.loadURL('about:blank')
})
`
)

const CODE = 'export function Button() {\n  return <button className="btn">Hi</button>\n}'
/** [file, page, query, action]: action = save | back (save → «Зберегти ще») | focus | submit | badport. */
const STATES = [
  ['popup-bookmark', 'popup', ''],
  ['popup-design', 'popup', 'url=https://dribbble.com/shots/1&target=design'],
  ['popup-library', 'popup', 'url=https://www.npmjs.com/package/zustand&title=zustand - npm'],
  [
    'popup-component',
    'popup',
    `url=https://ui.shadcn.com/docs/components/button&sel=${encodeURIComponent(CODE)}`
  ],
  [
    'popup-application',
    'popup',
    'url=https://djinni.co/jobs/1-frontend/&title=Middle Frontend Developer at Acme&sel=Ми шукаємо Frontend-розробника з досвідом React від 3 років.'
  ],
  ['popup-nokey', 'popup', 'key=0'],
  ['popup-offline', 'popup', 'ping=offline'],
  ['popup-unauthorized', 'popup', 'ping=401'],
  ['popup-timeout', 'popup', 'ping=timeout'],
  [
    'popup-long',
    'popup',
    `title=${encodeURIComponent('Дуже довга назва сторінки '.repeat(12) + 'Суперкаліфраджилістікекспіалідоціозний'.repeat(3))}`
  ],
  [
    'popup-selection',
    'popup',
    `url=https://example.com/post&sel=${encodeURIComponent('Виділений текст статті. '.repeat(40))}`
  ],
  ['popup-recent', 'popup', 'url=https://example.com/post&title=Post&recent=react,дизайн,почитати'],
  ['popup-restricted', 'popup', 'url=chrome://extensions/&title=Розширення'],
  ['popup-restricted-design', 'popup', 'url=chrome://extensions/&title=Розширення&target=design'],
  // Design's «needs a screenshot» error must go away on «Закладка».
  [
    'popup-restricted-switch',
    'popup',
    'url=chrome://extensions/&title=Розширення&target=design&then=bookmark'
  ],
  ['popup-area', 'popup', 'area=1'],
  // A failed selection with an older picture still stored: the old one must not come back.
  ['popup-area-error', 'popup', 'area=1&areaError=1'],
  ['popup-focus', 'popup', '', 'focus'],
  ['popup-saved', 'popup', '', 'save'],
  [
    'popup-saved-warning',
    'popup',
    'url=https://example.com/post&title=Post&capture=warning',
    'save'
  ],
  ['popup-back', 'popup', '', 'back'],
  ['popup-error', 'popup', 'capture=error', 'save'],
  ['popup-tags-error', 'popup', 'capture=tags', 'save'],
  ['options', 'options', ''],
  ['options-nokey', 'options', 'key=0'],
  ['options-offline', 'options', 'ping=offline', 'submit'],
  ['options-badport', 'options', '', 'badport']
]
const TYPES = [
  'popup-bookmark',
  'popup-design',
  'popup-library',
  'popup-component',
  'popup-application'
]
// Targets are picked from the URL by the popup (suggestTarget); «target=» clicks the chip to be sure.
const TARGET_LABEL = {
  design: 'Дизайн',
  bookmark: 'Закладка',
  library: 'Бібліотека',
  component: 'Компонент',
  application: 'Вакансія'
}

for (const theme of THEMES) {
  const dir = join(out, theme)
  mkdirSync(dir, { recursive: true })
  const app = await electron.launch({
    args: [join(work, 'main.cjs')],
    env: { ...process.env, THEME: theme }
  })
  const win = await app.firstWindow()
  const errors = []
  win.on('pageerror', (e) => errors.push(String(e)))
  await win.emulateMedia({ colorScheme: theme })
  for (const [file, page, query, action] of STATES) {
    const params = new URLSearchParams(query)
    const url = `file:///${join(ext, `${page}.test.html`).replace(/\\/g, '/')}?${query}`
    await win.goto(url)
    await win.waitForTimeout(500)
    const target = params.get('target') || file.replace('popup-', '')
    for (const t of [target, params.get('then')]) {
      if (page !== 'popup' || !TARGET_LABEL[t]) continue
      await win
        .getByRole('radio', { name: TARGET_LABEL[t], exact: true })
        .click()
        .catch(() => {})
      await win.waitForTimeout(200)
    }
    if (action === 'save' || action === 'back') {
      await win
        .locator('#save')
        .click()
        .catch(() => {})
      await win.waitForTimeout(500)
    }
    if (action === 'back') {
      await win
        .locator('#back')
        .click()
        .catch(() => {})
      await win.waitForTimeout(200)
    }
    if (action === 'focus') {
      // Back from «Назва» to the «Куди зберегти» group: the keyboard focus ring on a chip.
      await win.keyboard.press('Shift+Tab')
      await win.waitForTimeout(100)
    }
    if (action === 'badport') await win.locator('#port').fill('80')
    if (action === 'submit' || action === 'badport') {
      await win
        .locator('#save')
        .click()
        .catch(() => {})
      await win.waitForTimeout(500)
    }
    if (TYPES.includes(file)) {
      // Chrome caps the popup at 600px: the body scrolls under the sticky footer, the page itself never does.
      await win.setViewportSize({ width: 420, height: 600 })
      await win.waitForTimeout(100)
      const fit = await win.evaluate(() => {
        const body = document.body
        return {
          footer: document.querySelector('.wrap > .actions').getBoundingClientRect().bottom,
          page: document.documentElement.scrollHeight,
          // Taller content must scroll inside body, under the sticky footer.
          stuck:
            body.scrollHeight > body.clientHeight + 1 &&
            !/auto|scroll/.test(getComputedStyle(body).overflowY)
        }
      })
      if (fit.footer > 600 || fit.page > 600 || fit.stuck)
        console.warn(
          `[snap-extension] ${theme}/${file}: the footer leaves the 600px popup cap (footer ${Math.round(fit.footer)}px, page ${fit.page}px${fit.stuck ? ', body does not scroll' : ''})`
        )
      await win.screenshot({ path: join(dir, `${file}-600.png`) })
    }
    // Full content height: lift the 600px cap so every field is on the picture.
    await win.setViewportSize({ width: page === 'options' ? 640 : 420, height: 300 })
    const h = await win.evaluate(() => {
      document.body.style.maxHeight = 'none'
      return Math.min(Math.max(document.documentElement.scrollHeight, 200), 1400)
    })
    await win.setViewportSize({ width: page === 'options' ? 640 : 420, height: h })
    await win.screenshot({ path: join(dir, `${file}.png`) })
  }
  if (errors.length) console.log(`[snap-extension] ${theme} page errors:`, errors.slice(0, 5))
  await app.close()
  console.log(`[snap-extension] ${theme} done → ${dir}`)
}
rmSync(work, { recursive: true, force: true })
