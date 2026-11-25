import {
  AREA_TTL,
  CONNECTION_PROBLEMS,
  TARGETS,
  hostOf,
  isRestricted,
  setFieldError,
  suggestTarget,
  vaultFetch
} from './shared.js'

const $ = (id) => document.getElementById(id)
const TARGET_LABEL = Object.fromEntries(TARGETS.map((t) => [t.id, t.label]))

/** captureSchema limits: the popup stops here instead of the server refusing the whole record. */
const TITLE_MAX = 500
const TAG_MAX = 60
const TAGS_MAX = 20

/** What each target asks for: labels, the text field, tag examples, the default screenshot mode. */
const FIELDS = {
  design: {
    title: 'Назва',
    note: 'Нотатка',
    notePh: 'Чим сподобалося, де знадобиться',
    tagsPh: 'лендінг, dashboard',
    shot: 'visible',
    shotRequired: true
  },
  bookmark: {
    title: 'Назва',
    note: 'Нотатка',
    notePh: 'Навіщо зберігаю, що подивитися',
    tagsPh: 'react, почитати',
    body: 'Цитата зі сторінки',
    bodyPh: 'Виділіть текст на сторінці до відкриття — він з’явиться тут',
    shot: 'visible'
  },
  library: {
    title: 'Пакет або назва',
    note: 'Нотатка',
    notePh: 'Для чого знадобиться',
    tagsPh: 'стейт, форми',
    shot: 'none'
  },
  component: {
    title: 'Назва компонента',
    note: 'Опис',
    notePh: 'Що робить, де підглянув',
    tagsPh: 'кнопки, анімації',
    body: 'Код',
    bodyPh: 'Виділіть код на сторінці до відкриття або вставте сюди',
    code: true,
    shot: 'visible'
  },
  application: {
    title: 'Посада',
    note: 'Нотатка',
    notePh: 'Зарплата, контакти, враження',
    tagsPh: 'remote, react',
    body: 'Опис вакансії',
    bodyPh: 'Виділіть опис на сторінці до відкриття або вставте сюди',
    shot: 'none'
  }
}

const KINDS = [
  ['article', 'Стаття'],
  ['video', 'Відео'],
  ['course', 'Курс'],
  ['docs', 'Документація'],
  ['repo', 'Репо'],
  ['other', 'Інше']
]

const SHOT_MODES = [
  ['visible', 'Видима область'],
  ['area', 'Виділити область'],
  ['none', 'Без скриншота']
]

const RESTRICTED = 'Chrome не дозволяє скриншот цієї сторінки. Збережіть без скриншота.'
const DESIGN_RESTRICTED = 'Для дизайну потрібен скриншот, а Chrome не дозволяє зняти цю сторінку.'
const SAVE_FAILED = 'Не вдалося зберегти. Спробуйте ще раз.'

/** The popup always sends `kind`; the server's copy is only a fallback for old versions. */
function guessKind(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return 'article'
  }
  const host = u.hostname.replace(/^www\./, '')
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(host)) return 'video'
  if (/github\.com/.test(host)) return 'repo'
  if (/udemy|coursera|egghead|frontendmasters/.test(host)) return 'course'
  if (/^(docs|developer)\./.test(host) || /^\/(docs|reference|api)(\/|$)/.test(u.pathname))
    return 'docs'
  return 'article'
}

/** npm `/package/<name>` → package name, GitHub `/<owner>/<repo>` → repo; '' for other pages. */
function packageNameFrom(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return ''
  }
  const host = u.hostname.replace(/^www\./, '')
  const npm = host.endsWith('npmjs.com') && u.pathname.match(/^\/package\/((?:@[^/]+\/)?[^/]+)/)
  if (npm) return decodeURIComponent(npm[1])
  const gh = host === 'github.com' && u.pathname.match(/^\/[^/]+\/([^/]+)\/?$/)
  return gh ? gh[1] : ''
}

const state = {
  tab: null,
  target: 'bookmark',
  kind: 'article',
  mode: 'visible',
  modeTouched: false,
  screenshot: null,
  /** In-flight captureVisible(): init, type switches and save share one call (Chrome allows ~2 per second). */
  capturing: null,
  /** A failed capture is retried only by an explicit «Видима область». */
  captureFailed: false,
  saving: false,
  /** { type, id } of the record just saved; the form is closed while it is set. */
  saved: null,
  draftTimer: 0
}

/* ───────── draft ───────── */

const draftKey = () => `draft:${state.tab.id}`
const areaKey = () => `area:${state.tab.id}`
const areaErrorKey = () => `area-error:${state.tab.id}`

/** The popup closes on any click outside it: whatever was typed is kept per tab until it is saved. */
async function saveDraft() {
  if (!state.tab?.url || state.saving || state.saved) return
  await chrome.storage.session.set({
    [draftKey()]: {
      url: state.tab.url,
      target: state.target,
      title: $('title').value,
      note: $('note').value,
      tags: $('tags').value,
      selection: $('body').value,
      company: $('company').value,
      kind: state.kind,
      mode: state.mode,
      modeTouched: state.modeTouched
    }
  })
}

function scheduleDraft() {
  clearTimeout(state.draftTimer)
  state.draftTimer = setTimeout(() => void saveDraft(), 300)
}

/* ───────── status and errors ───────── */

const OPEN_SETTINGS = ['Відкрити налаштування', () => chrome.runtime.openOptionsPage()]
const RETRY = ['Перевірити знову', () => void ping()]
/** The fix for each connection problem: a key problem is solved in the settings, a missing Vault by checking again. */
const STATUS_ACTIONS = {
  nokey: OPEN_SETTINGS,
  unauthorized: OPEN_SETTINGS,
  offline: RETRY,
  timeout: RETRY
}

function setStatus(kind, text, problem) {
  $('status').dataset.state = kind
  $('status-text').textContent = text
  const action = kind === 'bad' ? STATUS_ACTIONS[problem] : null
  const button = $('status-action')
  button.hidden = !action
  if (action) {
    button.textContent = action[0]
    button.onclick = action[1]
  }
}

async function ping() {
  const retry = document.activeElement === $('status-action')
  setStatus('pending', 'Перевіряю…')
  const res = await vaultFetch('/ping')
  if (res.ok) setStatus('ok', 'Vault під’єднано')
  else setStatus('bad', res.error, res.status)
  if (retry && !$('status-action').hidden) $('status-action').focus()
}

function setError(text) {
  $('error').textContent = text || ''
}

/** Server messages start with the field label («Назва: …»): put them under that field. */
function showSaveError(text) {
  if (/^Назва:/.test(text)) return setFieldError('title', text)
  if (/^Мітк[аи]:/.test(text)) return setFieldError('tags', text)
  setError(text)
}

/* ───────── single-choice groups ───────── */

/**
 * A row of buttons with one value (role=radiogroup): one Tab stop, arrows/Home/End move and select.
 * `manual` values are only focused by arrows and act on Enter/Space/click («Виділити область» closes the popup).
 * Returns `sync(value)` that marks the chosen button.
 */
function radioGroup(box, items, onChange, manual = []) {
  box.setAttribute('role', 'radiogroup')
  const buttons = items.map(([value, label]) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('role', 'radio')
    b.dataset.value = value
    b.textContent = label
    b.addEventListener('click', () => onChange(value))
    return b
  })
  box.replaceChildren(...buttons)
  box.addEventListener('keydown', (e) => {
    const shown = buttons.filter((b) => !b.hidden)
    const i = shown.indexOf(document.activeElement)
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    const next = step
      ? shown[(i + step + shown.length) % shown.length]
      : e.key === 'Home'
        ? shown[0]
        : e.key === 'End'
          ? shown.at(-1)
          : null
    if (i < 0 || !next) return
    e.preventDefault()
    next.focus()
    if (!manual.includes(next.dataset.value)) onChange(next.dataset.value)
  })
  return (value) => {
    for (const b of buttons) {
      const on = b.dataset.value === value
      b.setAttribute('aria-checked', String(on))
      b.tabIndex = on ? 0 : -1
    }
  }
}

const syncTarget = radioGroup(
  $('targets'),
  TARGETS.map((t) => [t.id, t.label]),
  (id) => {
    // The title follows the type while it is untouched (library → package name).
    if ($('title').value === defaultTitle(state.target)) $('title').value = defaultTitle(id)
    state.target = id
    updateCount()
    renderFields()
    scheduleDraft()
  }
)
const syncKind = radioGroup($('kinds'), KINDS, (id) => {
  state.kind = id
  syncKind(id)
  scheduleDraft()
})
const syncMode = radioGroup($('shot-mode'), SHOT_MODES, (mode) => selectMode(mode), ['area'])

/* ───────── UI ───────── */

function defaultTitle(target) {
  return (target === 'library' && packageNameFrom(state.tab.url)) || state.tab.title || ''
}

function updateCount() {
  const n = $('title').value.length
  $('title-count').textContent = n >= TITLE_MAX * 0.8 ? `${n} / ${TITLE_MAX}` : ''
}

/** Caret at the start: a long title shows its beginning, not the tail. */
function focusTitle() {
  const title = $('title')
  title.focus()
  title.setSelectionRange(0, 0)
  title.scrollLeft = 0
}

async function renderRecentTags() {
  const { recentTags = [] } = await chrome.storage.local.get('recentTags')
  const chips = recentTags.map((tag) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chip'
    b.textContent = tag
    b.setAttribute('aria-label', `Додати мітку ${tag}`)
    b.addEventListener('click', () => {
      const current = parseTags($('tags').value)
      if (!current.includes(tag)) $('tags').value = [...current, tag].join(', ')
      setFieldError('tags', '')
      scheduleDraft()
    })
    return b
  })
  $('recent-tags').replaceChildren(...chips)
}

function renderMode() {
  syncMode(state.mode)
  const preview = $('preview')
  if (state.screenshot && state.mode !== 'none') {
    $('preview-img').src = state.screenshot
    preview.style.display = 'block'
  } else {
    preview.style.display = 'none'
  }
}

/** Labels, extra fields and the screenshot default follow the chosen type. */
function renderFields() {
  const f = FIELDS[state.target]
  syncTarget(state.target)
  for (const el of document.querySelectorAll('.field'))
    el.classList.toggle('on', el.dataset.for.split(' ').includes(state.target))
  $('title-label').textContent = f.title
  $('note-label').textContent = f.note
  $('note').placeholder = f.notePh
  $('tags').placeholder = f.tagsPh
  if (f.body) {
    $('body-label').textContent = f.body
    $('body').placeholder = f.bodyPh
    $('body').classList.toggle('code', !!f.code)
  }
  // Design needs a picture: no «Без скриншота» there.
  $('shot-mode').querySelector('[data-value="none"]').hidden = !!f.shotRequired
  if (!state.modeTouched || (f.shotRequired && state.mode === 'none')) state.mode = f.shot
  if (state.mode === 'visible' && !state.screenshot && isRestricted(state.tab.url)) {
    // Service pages can't be captured: no point trying (and failing) on every switch.
    if (f.shotRequired) setError(DESIGN_RESTRICTED)
    else state.mode = 'none'
  }
  if (state.mode === 'visible') void ensureScreenshot()
  syncKind(state.kind)
  renderMode()
}

function selectMode(mode) {
  setError('')
  state.modeTouched = true
  if (mode === 'area') return void startAreaSelection()
  if (mode === 'visible' && isRestricted(state.tab.url))
    return setError(FIELDS[state.target].shotRequired ? DESIGN_RESTRICTED : RESTRICTED)
  state.mode = mode
  if (mode === 'visible') {
    state.captureFailed = false
    void ensureScreenshot()
  }
  renderMode()
  scheduleDraft()
}

function parseTags(value) {
  return [
    ...new Set(
      value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    )
  ]
}

function tagsError(tags) {
  const long = tags.find((t) => t.length > TAG_MAX)
  if (long) return `Мітка «${long.slice(0, 20)}…» довша за ${TAG_MAX} символів`
  if (tags.length > TAGS_MAX) return `Не більше ${TAGS_MAX} міток`
  return ''
}

/* ───────── page data ───────── */

function ensureScreenshot() {
  if (state.screenshot || state.captureFailed || isRestricted(state.tab.url))
    return Promise.resolve()
  state.capturing ??= captureVisible().finally(() => {
    state.capturing = null
  })
  return state.capturing
}

async function captureVisible() {
  try {
    state.screenshot = await chrome.tabs.captureVisibleTab(state.tab.windowId, { format: 'png' })
  } catch (e) {
    console.error('[vault screenshot]', e)
    state.captureFailed = true
    setError(
      'Не вдалося зробити скриншот. Спробуйте «Виділити область» або збережіть без скриншота.'
    )
  }
  renderMode()
}

async function readSelection() {
  if (isRestricted(state.tab.url)) return ''
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      func: () => String(window.getSelection?.() ?? '')
    })
    return typeof res?.result === 'string' ? res.result.slice(0, 200_000) : ''
  } catch {
    return ''
  }
}

async function startAreaSelection() {
  if (isRestricted(state.tab.url)) return setError(RESTRICTED)
  clearTimeout(state.draftTimer)
  await saveDraft()
  try {
    await chrome.scripting.executeScript({ target: { tabId: state.tab.id }, files: ['select.js'] })
    window.close() // the overlay needs the page; the popup reopens when the area is captured
  } catch (e) {
    console.error('[vault area]', e)
    setError('Не вдалося почати виділення. Скористайтеся «Видима область».')
  }
}

/* ───────── save ───────── */

async function save() {
  if (state.saving || state.saved || !state.tab?.url) return
  setError('')
  const tags = parseTags($('tags').value)
  const tagProblem = tagsError(tags)
  if (tagProblem) {
    setFieldError('tags', tagProblem)
    $('tags').focus()
    return
  }
  // Written now so that a popup closed mid-request still has the input if the save fails.
  clearTimeout(state.draftTimer)
  await saveDraft()
  state.saving = true
  $('save').disabled = true
  $('save').textContent = 'Зберігаю…'
  const res = await send(tags)
  state.saving = false
  $('save').disabled = false
  $('save').textContent = 'Зберегти у Vault'
  if (!res.ok) {
    if (CONNECTION_PROBLEMS.includes(res.status)) {
      setStatus('bad', res.error, res.status)
      $('status').scrollIntoView({ block: 'nearest' })
    } else showSaveError(res.error)
    return
  }
  state.saved = { type: res.type, id: res.id }
  setStatus('ok', 'Vault під’єднано')
  showDone(res)
}

async function send(tags) {
  if (state.mode === 'visible') await ensureScreenshot()
  const screenshot = state.mode === 'none' ? null : state.screenshot
  if (FIELDS[state.target].shotRequired && !screenshot) {
    const error = isRestricted(state.tab.url)
      ? DESIGN_RESTRICTED
      : 'Для дизайну потрібен скриншот — виберіть «Видима область» або «Виділити область».'
    return { ok: false, status: 'error', error }
  }
  const body = {
    target: state.target,
    url: state.tab.url,
    title: $('title').value.trim(),
    note: $('note').value.trim(),
    tags,
    screenshot,
    selection: FIELDS[state.target].body ? $('body').value : '',
    company: state.target === 'application' ? $('company').value.trim() : '',
    kind: state.target === 'bookmark' ? state.kind : undefined
  }
  try {
    // The service worker sends it and clears the draft: the popup may close before the answer.
    return (
      (await chrome.runtime.sendMessage({ type: 'vault-capture', tabId: state.tab.id, body })) ?? {
        ok: false,
        error: SAVE_FAILED
      }
    )
  } catch (e) {
    console.error('[vault capture]', e)
    return { ok: false, error: SAVE_FAILED }
  }
}

function showDone(res) {
  const title = res.title || $('title').value
  $('form').style.display = 'none'
  $('done').style.display = 'flex'
  $('done-title').textContent = title
  $('done-title').title = title
  $('done-type').textContent = res.warning || `${TARGET_LABEL[state.target]}: збережено у Vault`
  $('open-record').hidden = !res.id
  $('close').focus()
}

/* ───────── init ───────── */

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  state.tab = tab
  if (!tab?.url) {
    setError('Не вдалося прочитати поточну вкладку')
    return
  }

  const stored = await chrome.storage.session.get([draftKey(), areaKey(), areaErrorKey()])
  const draft = stored[draftKey()]?.url === tab.url ? stored[draftKey()] : null
  const storedArea = stored[areaKey()]
  const area =
    storedArea?.url === tab.url && Date.now() - (storedArea.at ?? 0) < AREA_TTL ? storedArea : null
  const areaFailed = stored[areaErrorKey()]?.url === tab.url
  const { targets = {} } = await chrome.storage.local.get('targets')

  state.target = draft?.target || targets[hostOf(tab.url)] || suggestTarget(tab.url)
  $('title').value = draft?.title ?? defaultTitle(state.target)
  $('note').value = draft?.note ?? ''
  $('tags').value = draft?.tags ?? ''
  $('body').value = draft?.selection || ''
  $('company').value = draft?.company ?? ''
  state.kind = draft?.kind ?? guessKind(tab.url)
  // After the area capture the mode stays «area»; otherwise the draft or the type decides.
  state.modeTouched = !!draft?.modeTouched || !!area
  if (area) {
    state.mode = 'area'
    state.screenshot = area.dataUrl
  } else if (draft?.mode === 'none' || draft?.mode === 'visible') state.mode = draft.mode

  if (storedArea || areaFailed) {
    if (!area || areaFailed) await chrome.storage.session.remove([areaKey(), areaErrorKey()])
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' })
  }

  updateCount()
  renderFields()
  if (areaFailed)
    setError('Не вдалося зняти область. Спробуйте ще раз або виберіть «Видима область».')
  focusTitle()
  void renderRecentTags()

  const [selection] = await Promise.all([draft?.selection ? '' : readSelection(), ping()])
  if (selection && !$('body').value && document.activeElement !== $('body'))
    $('body').value = selection
}

$('form').addEventListener('input', (e) => {
  const id = e.target?.id
  if (id === 'title') updateCount()
  if (id === 'title' || id === 'tags') setFieldError(id, '')
  scheduleDraft()
})
window.addEventListener('pagehide', () => void saveDraft())
$('save').addEventListener('click', () => void save())
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage())
$('close').addEventListener('click', () => window.close())
$('open-record').addEventListener('click', async () => {
  const res = await vaultFetch('/open', { method: 'POST', body: state.saved })
  if (res.ok) window.close()
  else $('done-type').textContent = res.error
})
$('back').addEventListener('click', () => {
  state.saved = null
  $('done').style.display = 'none'
  $('form').style.display = ''
  $('note').value = ''
  $('body').value = ''
  setFieldError('title', '')
  setFieldError('tags', '')
  focusTitle()
})
document.addEventListener('keydown', (e) => {
  // Enter in a one-line field or Ctrl+Enter anywhere saves; only from the form, not from the «Збережено» screen.
  if (e.key !== 'Enter' || e.isComposing || state.saved) return
  if (e.ctrlKey || e.metaKey || e.target instanceof HTMLInputElement) {
    e.preventDefault()
    void save()
  }
})

init().catch((e) => {
  console.error('[vault popup]', e)
  setError('Не вдалося відкрити форму. Закрийте й відкрийте розширення ще раз.')
})
