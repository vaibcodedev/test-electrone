/**
 * Screenshots of the Chrome extension popup and options page in every state, rendered in Electron with a
 * stubbed `chrome.*` API and a fake Vault bridge (no browser, no running Vault needed):
 *   <out>/<theme>/popup-<target>.png              each target type, connected (full height)
 *   <out>/<theme>/popup-<target>-600.png          the same in Chrome's 600px popup cap (warns if the footer leaves it)
 *   <out>/<theme>/popup-offline | unauthorized | timeout .png   connection problems with a key
 *   <out>/<theme>/popup-long | selection | recent | focus .png
 *   <out>/<theme>/popup-restricted | restricted-design | restricted-switch .png   chrome:// page (design → bookmark)
 *   <out>/<theme>/popup-area | area-error .png      back after «Виділити область», a failed selection
 *   <out>/<theme>/popup-saved | saved-warning | back .png   after «Зберегти» (also without the picture), «Зберегти ще»
 *   <out>/<theme>/popup-error | tags-error .png     the server refused the title / the tags
 *   <out>/<theme>/popup-snippet | snippet-so | snippet-prose | snippet-long | snippet-other | snippet-empty
 *     | snippet-code-error | snippet-saved | note | note-saved | fix | fix-solution | fix-saved .png
 *                                                  code, text and error targets
 *   <out>/<theme>/popup-snippet-remembered | remembered-prose | snippet-old-auto .png
 *                                                  the site's remembered type vs the code hint, an older Vault
 *   <out>/<theme>/popup-old-vault .png              a Vault from before extension 0.2 (no snippet / note / fix)
 *   <out>/<theme>/popup-pair-ready | pair-rekey | pair-click | pair-waiting | pair-approved | pair-denied
 *     | pair-expired | pair-error | pair-offline | pair-unsupported .png
 *                                                  «Під’єднати до Vault»: found, key gone, the click, waiting for
 *                                                  «Дозволити», the answers, no Vault, a Vault without pairing
 *   <out>/<theme>/popup-update | update-stale .png  Vault has a newer extension: the reload screen; already
 *                                                  reloaded for it (another folder) — the hint over the form
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
 * key=0 · ping=offline|401|timeout|old|nopair · url · title · sel · recent=a,b · site=host:target · area=1
 * · areaError=1 · capture=error|tags|warning|code · pairing=waiting|approved|denied|expired (stored by the worker)
 * · pair=error (the answer to «Під’єднати») · ext=<Vault's extension version> · reloadedFor=<version>
 */
writeFileSync(
  join(ext, 'stub.js'),
  `
const q = new URLSearchParams(location.search)
const tabUrl = q.get('url') || 'https://dribbble.com/shots/123-dashboard'
const store = q.get('key') === '0' ? {} : { key: 'test-key', port: 47219 }
if (q.get('recent')) store.recentTags = q.get('recent').split(',')
if (q.get('reloadedFor')) store.reloadedFor = q.get('reloadedFor')
// site=github.com:library — the type last saved on that site.
if (q.get('site')) { const [h, t] = q.get('site').split(':'); store.targets = { [h]: t } }
const session = {}
const changed = []
const area = (s, name) => ({
  get: async (k) => { const o = {}; for (const x of k == null ? Object.keys(s) : [].concat(k)) if (x in s) o[x] = s[x]; return o },
  set: async (o) => {
    const diff = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { oldValue: s[k], newValue: v }]))
    Object.assign(s, o)
    for (const fn of changed) fn(diff, name)
  },
  remove: async (k) => { for (const x of [].concat(k)) delete s[x] }
})
// What the service worker would have stored: a pairing in progress or its answer.
const PAIRINGS = {
  waiting: () => ({ state: 'waiting', id: 'p1', port: 47219, expiresAt: Date.now() + 52_000 }),
  approved: () => ({ state: 'approved' }),
  denied: () => ({ state: 'denied' }),
  expired: () => ({ state: 'expired' })
}
if (PAIRINGS[q.get('pairing')]) session.pairing = PAIRINGS[q.get('pairing')]()
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
  storage: {
    local: area(store, 'local'),
    session: area(session, 'session'),
    onChanged: { addListener: (fn) => changed.push(fn) }
  },
  scripting: { executeScript: async () => [{ result: q.get('sel') || '' }] },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, openPopup: async () => {} },
  runtime: {
    openOptionsPage() {},
    getManifest: () => ({ version: '0.3.0' }),
    reload() { document.documentElement.dataset.reloaded = '1' },
    // The popup saves and pairs through the service worker; here the same code or its answer.
    sendMessage: async (msg) => {
      if (msg?.type === 'vault-capture') return (await import('./shared.js')).sendCapture(msg.tabId, msg.body)
      if (msg?.type === 'vault-pair') {
        const next = q.get('pair') === 'error'
          ? { state: 'error', error: 'Забагато запитів на під’єднання. Зачекайте хвилину й спробуйте ще раз.' }
          : PAIRINGS.waiting()
        await window.chrome.storage.session.set({ pairing: next })
        return next
      }
      if (msg?.type === 'vault-pair-cancel') delete session.pairing
      return {}
    },
    onMessage: { addListener() {} }
  }
}
const realFetch = window.fetch
window.fetch = async (url, init) => {
  if (!String(url).startsWith('http://127.0.0.1')) return realFetch(url, init)
  if (q.get('ping') === 'offline') throw new TypeError('Failed to fetch')
  if (q.get('ping') === 'timeout') throw new DOMException('t', 'TimeoutError')
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  // Vault 0.3+ answers a missing or refused key with «I am here, pair with me»; ping=nopair is an older Vault.
  const noKey = !init?.headers?.['X-Vault-Key']
  if (q.get('ping') === '401' || q.get('ping') === 'nopair' || noKey)
    return json(401, {
      ok: false,
      error: 'Ключ не підходить. Скопіюйте новий у Vault: Налаштування → «Розширення для Chrome».',
      ...(q.get('ping') === 'nopair' ? {} : { app: 'vault', pair: 1 })
    })
  // A bridge from before extension 0.2 does not list its targets.
  const targets = ['design', 'bookmark', 'library', 'component', 'application', 'snippet', 'note', 'fix']
  if (String(url).endsWith('/ping'))
    return json(200, {
      ok: true,
      app: 'vault',
      version: '0.1.0',
      ...(q.get('ping') === 'old' ? {} : { targets, extension: q.get('ext') || '0.3.0', pair: 1 })
    })
  if (q.get('capture') === 'error') return json(400, { ok: false, error: 'Назва: занадто довго — максимум 500 символів' })
  if (q.get('capture') === 'tags') return json(400, { ok: false, error: 'Мітки: занадто довго — максимум 60 символів' })
  if (q.get('capture') === 'code') return json(400, { ok: false, error: 'Код: виділіть код на сторінці або вставте його сюди' })
  const body = JSON.parse(init?.body || '{}')
  const section = { design: 'Галерея', bookmark: 'Закладки', library: 'Бібліотеки', component: 'Компоненти', application: 'Вакансії', snippet: 'Сніпети', note: 'Нотатки', fix: 'Помилки й рішення' }[body.target]
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
const TS_CODE = [
  'export function useDebounce<T>(value: T, delay = 300): T {',
  '  const [debounced, setDebounced] = useState(value)',
  '  useEffect(() => {',
  '    const id = setTimeout(() => setDebounced(value), delay)',
  '    return () => clearTimeout(id)',
  '  }, [value, delay])',
  '  return debounced',
  '}'
].join('\n')
const JS_CODE =
  'function debounce(fn, ms) {\n  let t\n  return (...args) => {\n    clearTimeout(t)\n    t = setTimeout(() => fn(...args), ms)\n  }\n}'
/** 200 lines and one very long line: the field must scroll, not push the footer out of the popup. */
const LONG_CODE = Array.from({ length: 200 }, (_, i) =>
  i === 3
    ? `const veryLongLine = '${'x'.repeat(400)}'`
    : `const value${i} = compute(${i}, { retries: 3, timeout: ${i * 10} })`
).join('\n')
const PY_CODE =
  'def debounce(fn, wait):\n    timer = None\n    def wrapped(*args):\n        nonlocal timer\n        return fn(*args)\n    return wrapped'
const STACK = [
  "TypeError: Cannot read properties of undefined (reading 'map')",
  '    at TodoList (webpack-internal:///./src/TodoList.tsx:12:23)',
  '    at renderWithHooks (react-dom.development.js:16305:18)',
  '    at mountIndeterminateComponent (react-dom.development.js:20074:13)'
].join('\n')
const GH_FILE = {
  url: 'https://github.com/vercel/swr/blob/main/src/hooks/use-debounce.ts',
  title: 'swr/src/hooks/use-debounce.ts at main · vercel/swr · GitHub'
}
const SO_PAGE = {
  url: 'https://stackoverflow.com/questions/24004791/what-is-the-debounce-function',
  title: 'javascript - What is the "debounce" function in JavaScript? - Stack Overflow'
}
const GH_ISSUE = {
  url: 'https://github.com/facebook/react/issues/1',
  title: "Cannot read properties of undefined (reading 'map') · Issue #1 · facebook/react · GitHub"
}
const POST = { url: 'https://example.com/post', title: 'Post' }
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
  ['popup-pair-ready', 'popup', 'key=0'],
  ['popup-pair-rekey', 'popup', 'ping=401'],
  // «Під’єднати до Vault» clicked: the worker sent the request, the popup waits for «Дозволити».
  ['popup-pair-click', 'popup', 'key=0', 'pair'],
  ['popup-pair-waiting', 'popup', 'key=0&pairing=waiting'],
  ['popup-pair-approved', 'popup', 'pairing=approved'],
  ['popup-pair-denied', 'popup', 'key=0&pairing=denied'],
  ['popup-pair-expired', 'popup', 'key=0&pairing=expired'],
  ['popup-pair-error', 'popup', 'key=0&pair=error', 'pair'],
  ['popup-pair-offline', 'popup', 'key=0&ping=offline'],
  ['popup-pair-unsupported', 'popup', 'key=0&ping=nopair'],
  ['popup-offline', 'popup', 'ping=offline'],
  // A Vault from before 0.3 refusing a pasted key: the old plate with «Відкрити налаштування».
  ['popup-unauthorized', 'popup', 'ping=nopair'],
  ['popup-update', 'popup', 'ext=0.3.1'],
  ['popup-update-stale', 'popup', 'ext=0.3.1&reloadedFor=0.3.1'],
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
  // Code on a GitHub file / Stack Overflow: «Сніпет» is suggested by itself (target=auto: no click), the title
  // is cut to «file · owner/repo» / the question, the language is guessed.
  [
    'popup-snippet',
    'popup',
    new URLSearchParams({ ...GH_FILE, sel: TS_CODE, target: 'auto', expect: 'snippet' })
  ],
  [
    'popup-snippet-so',
    'popup',
    new URLSearchParams({ ...SO_PAGE, sel: JS_CODE, target: 'auto', expect: 'snippet' })
  ],
  // Prose selected on Stack Overflow is not code: no «Сніпет».
  [
    'popup-snippet-prose',
    'popup',
    new URLSearchParams({
      ...SO_PAGE,
      sel: 'Debounce delays a call until the user stops typing.',
      target: 'auto',
      expect: 'bookmark'
    })
  ],
  [
    'popup-snippet-long',
    'popup',
    new URLSearchParams({
      url: 'https://gist.github.com/a/1',
      title: 'utils.ts',
      sel: LONG_CODE,
      target: 'auto',
      expect: 'snippet'
    })
  ],
  // A repo once saved as «Бібліотека» from github.com: code in a file still turns into «Сніпет»,
  // prose keeps the site's remembered type.
  [
    'popup-snippet-remembered',
    'popup',
    new URLSearchParams({
      ...GH_FILE,
      sel: TS_CODE,
      site: 'github.com:library',
      target: 'auto',
      expect: 'snippet'
    })
  ],
  [
    'popup-remembered-prose',
    'popup',
    new URLSearchParams({
      ...GH_FILE,
      sel: 'A hook that delays a value.',
      site: 'github.com:library',
      target: 'auto',
      expect: 'library'
    })
  ],
  // An older Vault cannot save snippets: code on GitHub keeps the usual type, no error up front.
  [
    'popup-snippet-old-auto',
    'popup',
    new URLSearchParams({
      ...GH_FILE,
      sel: TS_CODE,
      ping: 'old',
      target: 'auto',
      expect: 'bookmark'
    })
  ],
  // Python has no id in the app: «Мову не визначено», saved as «Текст».
  [
    'popup-snippet-other',
    'popup',
    new URLSearchParams({ ...POST, sel: PY_CODE, target: 'snippet' })
  ],
  // Nothing selected: «Зберегти» asks for the code under the field instead of sending.
  ['popup-snippet-empty', 'popup', new URLSearchParams({ ...POST, target: 'snippet' }), 'save'],
  [
    'popup-snippet-code-error',
    'popup',
    new URLSearchParams({ ...GH_FILE, sel: TS_CODE, target: 'snippet', capture: 'code' }),
    'save'
  ],
  [
    'popup-snippet-saved',
    'popup',
    new URLSearchParams({ ...GH_FILE, sel: TS_CODE, target: 'snippet' }),
    'save'
  ],
  [
    'popup-note',
    'popup',
    new URLSearchParams({
      url: 'https://example.com/post',
      title: 'How we ship — Blog',
      sel: 'Виділений абзац статті, який хочеться зберегти. '.repeat(6),
      target: 'note'
    })
  ],
  [
    'popup-note-saved',
    'popup',
    new URLSearchParams({ ...POST, sel: 'Абзац', target: 'note' }),
    'save'
  ],
  ['popup-fix', 'popup', new URLSearchParams({ ...GH_ISSUE, sel: STACK, target: 'fix' })],
  [
    'popup-fix-solution',
    'popup',
    new URLSearchParams({ ...GH_ISSUE, sel: STACK, target: 'fix' }),
    'solution'
  ],
  [
    'popup-fix-saved',
    'popup',
    new URLSearchParams({ ...GH_ISSUE, sel: STACK, target: 'fix' }),
    'save'
  ],
  // A Vault without the new targets: the form asks to update it instead of failing on «Зберегти».
  [
    'popup-old-vault',
    'popup',
    new URLSearchParams({ ...GH_FILE, sel: TS_CODE, ping: 'old', target: 'snippet' }),
    'save'
  ],
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
  'popup-application',
  'popup-snippet',
  'popup-snippet-long',
  'popup-note',
  'popup-fix',
  'popup-fix-solution'
]
// Targets are picked from the URL by the popup (suggestTarget); «target=» clicks the chip to be sure.
const TARGET_LABEL = {
  design: 'Дизайн',
  bookmark: 'Закладка',
  library: 'Бібліотека',
  component: 'Компонент',
  application: 'Вакансія',
  snippet: 'Сніпет',
  note: 'Нотатка',
  fix: 'Помилка'
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
    const expect = params.get('expect')
    if (expect) {
      const chosen = await win.evaluate(
        () => document.querySelector('#targets [aria-checked="true"]')?.dataset.value
      )
      if (chosen !== expect)
        console.warn(
          `[snap-extension] ${theme}/${file}: suggested «${chosen}», expected «${expect}»`
        )
    }
    if (action === 'solution')
      await win
        .locator('#solution')
        .fill(
          'Дані приходять асинхронно: початкове значення — порожній масив.\nuseState<Todo[]>([])'
        )
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
    if (action === 'pair') {
      await win
        .locator('#connect-primary')
        .click()
        .catch(() => {})
      await win.waitForTimeout(300)
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
