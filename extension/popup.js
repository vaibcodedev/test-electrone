import {
  AREA_TTL,
  CONNECTION_PROBLEMS,
  TARGETS,
  hostOf,
  isRestricted,
  setFieldError,
  suggestTarget,
  urlParts,
  vaultFetch
} from './shared.js'

const $ = (id) => document.getElementById(id)

/** captureSchema limits: the popup stops here instead of the server refusing the whole record. */
const TITLE_MAX = 500
/** A library name is MAX.name on the server: longer would be cut silently. */
const NAME_MAX = 200
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
    titleMax: NAME_MAX,
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

const RESTRICTED = 'Chrome не дає зробити скриншот цієї сторінки — збережіть без нього.'
const DESIGN_RESTRICTED =
  'Дизайн без скриншота не зберегти — виберіть інший тип, наприклад «Закладка».'
const CAPTURE_FAILED =
  'Не вдалося зробити скриншот. Спробуйте «Виділити область» або збережіть без скриншота.'
const AREA_FAILED = 'Не вдалося зняти область — спробуйте виділити ще раз.'
const SAVE_FAILED = 'Не вдалося зберегти. Спробуйте ще раз.'

/** The popup always sends `kind`; the server's copy is only a fallback for old versions. */
function guessKind(url) {
  const parts = urlParts(url)
  if (!parts) return 'article'
  const { host, path } = parts
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(host)) return 'video'
  if (/github\.com/.test(host)) return 'repo'
  if (/udemy|coursera|egghead|frontendmasters/.test(host)) return 'course'
  if (/^(docs|developer)\./.test(host) || /^\/(docs|reference|api)(\/|$)/.test(path)) return 'docs'
  return 'article'
}

/** GitHub pages whose first segment is not an owner. */
const GITHUB_SERVICE = new Set(['orgs', 'features', 'settings', 'topics', 'marketplace'])

/**
 * npm `/package/<name>` → package name, GitHub `/<owner>/<repo>/…` → repo; '' for other pages.
 * Same rules as the server's parseLibraryPage: a repo subpage still names the repo.
 */
function packageNameFrom(url) {
  const parts = urlParts(url)
  if (!parts) return ''
  const { host, path } = parts
  if (host === 'npmjs.com' || host.endsWith('.npmjs.com')) {
    const npm = path.match(/^\/package\/((?:@[^/]+\/)?[^/]+)/)
    return npm ? decodeURIComponent(npm[1]) : ''
  }
  const gh = host === 'github.com' && path.match(/^\/([^/]+)\/([^/]+)/)
  return gh && !GITHUB_SERVICE.has(gh[1]) ? gh[2] : ''
}

/**
 * «Dashboard UI concept — Dribbble» → «Dashboard UI concept»: the tail goes only when it is the site's own
 * name (the link is saved anyway). Anything else after a dash may be part of the title and stays.
 */
function cleanTitle(title, url) {
  const site = urlParts(url)?.host.split('.').at(-2)
  const m = title.match(/\s+[-–—|·]\s+([^-–—|·]+)$/)
  return site && m && m[1].toLowerCase().replace(/\s+/g, '') === site
    ? title.slice(0, m.index)
    : title
}

/** «Middle Frontend Developer at Acme» → position and company; null without « at ». */
function vacancyParts(title) {
  const m = title.match(/^(.+?)\s+at\s+(.+)$/i)
  return m ? { position: m[1], company: m[2] } : null
}

const state = {
  tab: null,
  target: 'bookmark',
  kind: 'article',
  mode: 'visible',
  modeTouched: false,
  /** «Видима область» and «Виділити область» are different pictures: switching the mode must not swap them. */
  shots: { visible: null, area: null },
  /** What #error says about the screenshot ('' | 'restricted' | 'capture' | 'area' | 'required'): renderFields() recomputes it. */
  shotError: '',
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
  // After a successful check the button is gone: keep the keyboard in the form, not on <body>.
  if (retry) {
    if (!$('status-action').hidden) $('status-action').focus()
    else focusTitle()
  }
}

/** `shotError` marks a screenshot problem: the next renderFields() drops it if it no longer applies. */
function setError(text, shotError = '') {
  state.shotError = text ? shotError : ''
  $('error').textContent = text || ''
}

/**
 * Server messages start with the field label («Назва: …», older servers «Запис 4 → Мітки: …»): show them
 * under that field without repeating the label it already has.
 */
function showSaveError(text) {
  const m = text.match(/^(?:Запис \d+ → )?(Назва|Мітк[аи])\s*:\s*(.+)$/s)
  if (!m) return setError(text)
  const id = m[1] === 'Назва' ? 'title' : 'tags'
  setFieldError(id, m[2][0].toUpperCase() + m[2].slice(1))
  $(id).focus()
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
    // Arrows skip hidden and unavailable choices (the focused one may still be left).
    const shown = buttons.filter(
      (b) =>
        !b.hidden && (b === document.activeElement || b.getAttribute('aria-disabled') !== 'true')
    )
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
    // A length error belongs to the type it was shown for.
    if ($('title').value.trim().length <= titleMax()) setFieldError('title', '')
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

const pageTitle = () => cleanTitle(state.tab.title || '', state.tab.url)

function defaultTitle(target) {
  // A library name is capped at NAME_MAX: a long docs title must not arrive already over the limit.
  if (target === 'library')
    return (packageNameFrom(state.tab.url) || pageTitle()).slice(0, NAME_MAX).trimEnd()
  if (target === 'application') return vacancyParts(pageTitle())?.position ?? pageTitle()
  return pageTitle()
}

const titleMax = () => FIELDS[state.target].titleMax ?? TITLE_MAX

function updateCount() {
  const n = $('title').value.length
  const max = titleMax()
  const count = $('title-count')
  count.textContent = n >= max * 0.8 ? `${n} / ${max}` : ''
  count.toggleAttribute('data-full', n >= max)
}

/** Caret at the start: a long title shows its beginning, not the tail. */
function focusTitle() {
  const title = $('title')
  title.focus()
  title.setSelectionRange(0, 0)
  title.scrollTop = 0
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

const currentShot = () => (state.mode === 'none' ? null : state.shots[state.mode])
const restrictedText = () => (FIELDS[state.target].shotRequired ? DESIGN_RESTRICTED : RESTRICTED)

function renderMode() {
  syncMode(state.mode)
  const preview = $('preview')
  const shot = currentShot()
  if (shot) {
    $('preview-img').src = shot
    preview.style.display = 'block'
  } else {
    preview.style.display = 'none'
  }
}

/** Labels, extra fields and the screenshot default follow the chosen type. */
function renderFields() {
  const f = FIELDS[state.target]
  const restricted = isRestricted(state.tab.url)
  if (state.shotError) setError('')
  syncTarget(state.target)
  for (const el of document.querySelectorAll('.field'))
    el.classList.toggle('on', el.dataset.for.split(' ').includes(state.target))
  $('title-label').textContent = f.title
  $('title').maxLength = titleMax()
  $('note-label').textContent = f.note
  $('note').placeholder = f.notePh
  $('tags').placeholder = f.tagsPh
  if (f.body) {
    $('body-label').textContent = f.body
    // A service page gives no selection: only pasting is left.
    $('body').placeholder = restricted ? 'Вставте текст сюди' : f.bodyPh
    $('body').classList.toggle('code', !!f.code)
  }
  const shotMode = $('shot-mode')
  // Design needs a picture: no «Без скриншота» there.
  shotMode.querySelector('[data-value="none"]').hidden = !!f.shotRequired
  for (const value of ['visible', 'area']) {
    const button = shotMode.querySelector(`[data-value="${value}"]`)
    if (restricted) button.setAttribute('aria-disabled', 'true')
    else button.removeAttribute('aria-disabled')
  }
  $('shot-hint').hidden = !restricted
  // A hidden node referenced directly is still read: the hint is linked only while it is shown.
  if (restricted) shotMode.setAttribute('aria-describedby', 'shot-hint')
  else shotMode.removeAttribute('aria-describedby')
  if (!state.modeTouched || (f.shotRequired && state.mode === 'none')) state.mode = f.shot
  if (restricted && state.mode !== 'none') {
    // Service pages can't be captured: no point trying (and failing) on every switch.
    if (f.shotRequired) setError(DESIGN_RESTRICTED, 'restricted')
    else state.mode = 'none'
  }
  if (state.mode === 'visible') {
    if (state.captureFailed) setError(CAPTURE_FAILED, 'capture')
    else void ensureScreenshot()
  }
  syncKind(state.kind)
  renderMode()
}

function selectMode(mode) {
  setError('')
  if (mode !== 'none' && isRestricted(state.tab.url))
    return setError(restrictedText(), 'restricted')
  state.modeTouched = true
  if (mode === 'area') return void startAreaSelection()
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
  if (state.shots.visible || state.captureFailed || isRestricted(state.tab.url))
    return Promise.resolve()
  state.capturing ??= captureVisible().finally(() => {
    state.capturing = null
  })
  return state.capturing
}

async function captureVisible() {
  try {
    state.shots.visible = await chrome.tabs.captureVisibleTab(state.tab.windowId, {
      format: 'png'
    })
  } catch (e) {
    console.error('[vault screenshot]', e)
    state.captureFailed = true
    if (state.mode === 'visible') setError(CAPTURE_FAILED, 'capture')
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
  // maxLength stops typing only: a title typed under another type may already be longer than this one allows.
  const max = titleMax()
  if ($('title').value.trim().length > max) {
    setFieldError('title', `Не більше ${max} символів — скоротіть назву`)
    $('title').focus()
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
    } else if (res.shotError) setError(res.error, res.shotError)
    else showSaveError(res.error)
    return
  }
  state.saved = { type: res.type, id: res.id }
  setStatus('ok', 'Vault під’єднано')
  showDone(res)
}

async function send(tags) {
  if (state.mode === 'visible') await ensureScreenshot()
  const screenshot = currentShot()
  if (FIELDS[state.target].shotRequired && !screenshot) {
    const error = isRestricted(state.tab.url)
      ? DESIGN_RESTRICTED
      : 'Для дизайну потрібен скриншот — виберіть «Видима область» або «Виділити область».'
    // A screenshot problem, not a server one: switching to a type without a picture clears it.
    return { ok: false, status: 'error', error, shotError: 'required' }
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
  // A partial success (no picture) must not read as a full one under the same check mark.
  if (res.warning) $('done').dataset.state = 'warn'
  else delete $('done').dataset.state
  $('done-type').textContent =
    res.warning || (res.section ? `Збережено в розділі «${res.section}»` : 'Збережено у Vault')
  $('done-error').textContent = ''
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
  const areaFailed = stored[areaErrorKey()]?.url === tab.url
  // After a failed selection an older picture must not stand in for the new one.
  const area =
    !areaFailed && storedArea?.url === tab.url && Date.now() - (storedArea.at ?? 0) < AREA_TTL
      ? storedArea
      : null
  const { targets = {} } = await chrome.storage.local.get('targets')

  state.target = draft?.target || targets[hostOf(tab.url)] || suggestTarget(tab.url)
  $('title').value = draft?.title ?? defaultTitle(state.target)
  $('note').value = draft?.note ?? ''
  $('tags').value = draft?.tags ?? ''
  $('body').value = draft?.selection || ''
  // Guessed only without a draft: a company the user cleared stays cleared.
  $('company').value = draft ? (draft.company ?? '') : (vacancyParts(pageTitle())?.company ?? '')
  state.kind = draft?.kind ?? guessKind(tab.url)
  // After the area capture the mode stays «area»; otherwise the draft or the type decides.
  state.modeTouched = !!draft?.modeTouched || !!area
  if (area) {
    state.mode = 'area'
    state.shots.area = area.dataUrl
  } else if (draft?.mode === 'none' || draft?.mode === 'visible') state.mode = draft.mode

  if (storedArea || areaFailed) {
    if (!area || areaFailed) await chrome.storage.session.remove([areaKey(), areaErrorKey()])
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' })
  }

  updateCount()
  renderFields()
  if (areaFailed) setError(AREA_FAILED, 'area')
  focusTitle()
  void renderRecentTags()

  const [selection] = await Promise.all([draft?.selection ? '' : readSelection(), ping()])
  if (selection && !$('body').value && document.activeElement !== $('body'))
    $('body').value = selection
}

$('form').addEventListener('input', (e) => {
  const id = e.target?.id
  // «Назва» wraps like a textarea but stays one line: a pasted line break becomes a space.
  if (id === 'title' && /[\r\n]/.test(e.target.value))
    e.target.value = e.target.value.replace(/\r?\n/g, ' ')
  if (id === 'title') updateCount()
  if (id === 'title' || id === 'tags') setFieldError(id, '')
  scheduleDraft()
})
window.addEventListener('pagehide', () => void saveDraft())
$('save').addEventListener('click', () => void save())
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage())
$('close').addEventListener('click', () => window.close())
$('open-record').addEventListener('click', async () => {
  const button = $('open-record')
  if (button.disabled) return
  button.disabled = true
  $('done-error').textContent = ''
  const res = await vaultFetch('/open', {
    method: 'POST',
    body: state.saved,
    fallback: 'Не вдалося відкрити запис у Vault.'
  })
  button.disabled = false
  if (res.ok) window.close()
  else $('done-error').textContent = res.error
})
$('back').addEventListener('click', () => {
  state.saved = null
  delete $('done').dataset.state
  $('done-error').textContent = ''
  $('done').style.display = 'none'
  $('form').style.display = ''
  $('note').value = ''
  $('body').value = ''
  setFieldError('title', '')
  setFieldError('tags', '')
  focusTitle()
})
document.addEventListener('keydown', (e) => {
  // Enter in a one-line field («Назва» included) or Ctrl+Enter anywhere saves; only from the form.
  if (e.key !== 'Enter' || e.isComposing || state.saved) return
  if (e.ctrlKey || e.metaKey || e.target instanceof HTMLInputElement || e.target.id === 'title') {
    e.preventDefault()
    void save()
  }
})

init().catch((e) => {
  console.error('[vault popup]', e)
  setError('Не вдалося відкрити форму. Закрийте й відкрийте розширення ще раз.')
})
