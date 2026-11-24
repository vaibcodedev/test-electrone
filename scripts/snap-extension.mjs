/**
 * Screenshots of the Chrome extension popup and options page in every state, rendered in Electron with a
 * stubbed `chrome.*` API and a fake Vault bridge (no browser, no running Vault needed):
 *   <out>/<theme>/popup-<target>.png              each target type, connected
 *   <out>/<theme>/popup-nokey.png | popup-offline.png | popup-long.png | popup-selection.png
 *   <out>/<theme>/popup-saved.png | popup-error.png | options.png
 * Usage: node scripts/snap-extension.mjs <out> [--themes=dark,light]
 */
import { _electron as electron } from 'playwright-core'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const out = resolve(process.argv[2] ?? 'snap-extension')
const THEMES = (process.argv.find((a) => a.startsWith('--themes='))?.split('=')[1] ?? 'dark,light').split(',')
const work = mkdtempSync(join(tmpdir(), 'vault-ext-'))
const ext = join(work, 'ext')
cpSync(resolve('extension'), ext, { recursive: true })

/** chrome.* + fetch stub; the state comes from the page URL (?key=…&ping=…&title=…&sel=…&capture=…). */
writeFileSync(join(ext, 'stub.js'), `
const q = new URLSearchParams(location.search)
const store = q.get('key') === '0' ? {} : { key: 'test-key', port: 47219 }
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
window.chrome = {
  tabs: {
    query: async () => [{ id: 7, windowId: 1, url: q.get('url') || 'https://dribbble.com/shots/123-dashboard', title: q.get('title') || 'Dashboard UI concept — Dribbble' }],
    captureVisibleTab: async () => shot()
  },
  storage: { local: area(store), session: area(session) },
  scripting: { executeScript: async () => [{ result: q.get('sel') || '' }] },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, openPopup: async () => {} },
  runtime: { openOptionsPage() {}, sendMessage: async () => ({}), onMessage: { addListener() {} }, onStartup: { addListener() {} } }
}
const realFetch = window.fetch
window.fetch = async (url, init) => {
  if (!String(url).startsWith('http://127.0.0.1')) return realFetch(url, init)
  if (q.get('ping') === 'offline') throw new TypeError('Failed to fetch')
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (String(url).endsWith('/ping')) return json(200, { ok: true, app: 'vault', version: '0.1.0' })
  if (q.get('capture') === 'error') return json(400, { ok: false, error: 'Назва: занадто довго — максимум 500 символів' })
  const body = JSON.parse(init?.body || '{}')
  return json(200, { ok: true, type: body.target, id: 'x', title: body.title || 'Без назви' })
}
`)
for (const page of ['popup.html', 'options.html']) {
  const html = readFileSync(join(ext, page), 'utf8')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace(/<script type="module" src="(\w+)\.js"><\/script>/, '<script src="stub.js"></script><script type="module" src="$1.js"></script>')
  writeFileSync(join(ext, page.replace('.html', '.test.html')), html)
}
writeFileSync(join(work, 'main.cjs'), `
const { app, BrowserWindow, nativeTheme } = require('electron')
app.whenReady().then(() => {
  nativeTheme.themeSource = process.env.THEME || 'dark'
  const w = new BrowserWindow({ width: Number(process.env.W || 420), height: 640, show: false, useContentSize: true })
  w.loadURL('about:blank')
})
`)

const STATES = [
  ['popup-bookmark', 'popup', ''],
  ['popup-design', 'popup', 'url=https://dribbble.com/shots/1&target=design'],
  ['popup-library', 'popup', 'url=https://www.npmjs.com/package/zustand&title=zustand - npm'],
  ['popup-component', 'popup', 'url=https://ui.shadcn.com/docs/components/button&sel=export function Button() {\\n  return <button className="btn">Hi</button>\\n}'],
  ['popup-application', 'popup', 'url=https://djinni.co/jobs/1-frontend/&title=Middle Frontend Developer at Acme&sel=Ми шукаємо Frontend-розробника з досвідом React від 3 років.'],
  ['popup-nokey', 'popup', 'key=0'],
  ['popup-offline', 'popup', 'ping=offline'],
  ['popup-long', 'popup', `title=${encodeURIComponent('Дуже довга назва сторінки '.repeat(12) + 'Суперкаліфраджилістікекспіалідоціозний'.repeat(3))}`],
  ['popup-selection', 'popup', `sel=${encodeURIComponent('Виділений текст статті. '.repeat(40))}`],
  ['popup-saved', 'popup', 'save=1'],
  ['popup-error', 'popup', 'save=1&capture=error'],
  ['options', 'options', '']
]
// Targets are picked from the URL by the popup (suggestTarget); «target=» clicks the chip to be sure.
const TARGET_LABEL = { design: 'Дизайн', bookmark: 'Закладка', library: 'Бібліотека', component: 'Компонент', application: 'Вакансія' }

for (const theme of THEMES) {
  const dir = join(out, theme)
  mkdirSync(dir, { recursive: true })
  const app = await electron.launch({ args: [join(work, 'main.cjs')], env: { ...process.env, THEME: theme } })
  const win = await app.firstWindow()
  const errors = []
  win.on('pageerror', (e) => errors.push(String(e)))
  await win.emulateMedia({ colorScheme: theme })
  for (const [file, page, query] of STATES) {
    const params = new URLSearchParams(query)
    const url = `file:///${join(ext, `${page}.test.html`).replace(/\\/g, '/')}?${query}`
    await win.goto(url)
    await win.waitForTimeout(500)
    const target = params.get('target') || file.replace('popup-', '')
    if (page === 'popup' && TARGET_LABEL[target]) {
      await win.getByRole('button', { name: TARGET_LABEL[target], exact: true }).click().catch(() => {})
      await win.waitForTimeout(200)
    }
    if (params.get('save')) {
      await win.locator('#save').click().catch(() => {})
      await win.waitForTimeout(500)
    }
    // Full content height: the popup can be taller than the window.
    await win.setViewportSize({ width: page === 'options' ? 640 : 420, height: 300 })
    const h = await win.evaluate(() => Math.min(Math.max(document.body.scrollHeight, 200), 1400))
    await win.setViewportSize({ width: page === 'options' ? 640 : 420, height: h })
    await win.screenshot({ path: join(dir, `${file}.png`) })
  }
  if (errors.length) console.log(`[snap-extension] ${theme} page errors:`, errors.slice(0, 5))
  await app.close()
  console.log(`[snap-extension] ${theme} done → ${dir}`)
}
