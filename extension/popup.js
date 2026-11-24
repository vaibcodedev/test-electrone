import { TARGETS, hostOf, isRestricted, suggestTarget, vaultFetch } from './shared.js'

const $ = (id) => document.getElementById(id)
const TARGET_LABEL = Object.fromEntries(TARGETS.map((t) => [t.id, t.label]))

/** What each target asks for: labels, the text field, the default screenshot mode. */
const FIELDS = {
  design: { title: 'Назва', note: 'Нотатка', notePh: 'Чим сподобалося, де знадобиться', shot: 'visible', shotRequired: true },
  bookmark: { title: 'Назва', note: 'Нотатка', notePh: 'Навіщо зберігаю, що подивитися', body: 'Цитата зі сторінки', bodyPh: 'Виділіть текст на сторінці до відкриття — він з’явиться тут', shot: 'visible' },
  library: { title: 'Пакет або назва', note: 'Нотатка', notePh: 'Для чого знадобиться', shot: 'none' },
  component: { title: 'Назва компонента', note: 'Опис', notePh: 'Що робить, де підглянув', body: 'Код', bodyPh: 'Виділіть код на сторінці до відкриття або вставте сюди', code: true, shot: 'visible' },
  application: { title: 'Посада', note: 'Нотатка', notePh: 'Зарплата, контакти, враження', body: 'Опис вакансії', bodyPh: 'Виділіть опис на сторінці до відкриття або вставте сюди', shot: 'none' }
}

const KINDS = [
  ['article', 'Стаття'],
  ['video', 'Відео'],
  ['course', 'Курс'],
  ['docs', 'Документація'],
  ['repo', 'Репо'],
  ['other', 'Інше']
]

/** Same guess as the Vault side, so the chip shows what would be saved anyway. */
function guessKind(url) {
  const host = hostOf(url)
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(host)) return 'video'
  if (/github\.com/.test(host)) return 'repo'
  if (/udemy|coursera|egghead|frontendmasters/.test(host)) return 'course'
  if (/^docs\.|developer\.|\/docs/.test(host)) return 'docs'
  return 'article'
}

const state = {
  tab: null,
  kind: 'article',
  modeTouched: false,
  target: 'bookmark',
  mode: 'visible',
  screenshot: null,
  selection: '',
  saving: false
}

/* ───────── storage helpers ───────── */

const draftKey = () => `draft:${state.tab.id}`
const areaKey = () => `area:${state.tab.id}`

async function saveDraft() {
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
      modeTouched: state.modeTouched
    }
  })
}

async function rememberTarget() {
  const host = hostOf(state.tab.url)
  if (!host) return
  const { targets = {} } = await chrome.storage.local.get('targets')
  targets[host] = state.target
  await chrome.storage.local.set({ targets })
}

async function rememberTags(tags) {
  const { recentTags = [] } = await chrome.storage.local.get('recentTags')
  const next = [...tags, ...recentTags.filter((t) => !tags.includes(t))].slice(0, 12)
  await chrome.storage.local.set({ recentTags: next })
}

/* ───────── UI ───────── */

function setStatus(kind, text) {
  $('status').dataset.state = kind
  $('status-text').textContent = text
}

function setError(text) {
  $('error').textContent = text || ''
}

function renderTargets() {
  const box = $('targets')
  box.replaceChildren()
  for (const t of TARGETS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chip'
    b.textContent = t.label
    b.setAttribute('aria-pressed', String(state.target === t.id))
    b.addEventListener('click', () => {
      state.target = t.id
      renderTargets()
      renderFields()
    })
    box.append(b)
  }
}

async function renderRecentTags() {
  const { recentTags = [] } = await chrome.storage.local.get('recentTags')
  const box = $('recent-tags')
  box.replaceChildren()
  for (const tag of recentTags) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chip small'
    b.textContent = tag
    b.addEventListener('click', () => {
      const current = parseTags($('tags').value)
      if (!current.includes(tag)) $('tags').value = [...current, tag].join(', ')
    })
    box.append(b)
  }
}

function renderMode() {
  for (const b of $('shot-mode').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode))
  }
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
  for (const el of document.querySelectorAll('.field')) el.classList.toggle('on', el.dataset.for.split(' ').includes(state.target))
  $('title-label').textContent = f.title
  $('note-label').textContent = f.note
  $('note').placeholder = f.notePh
  if (f.body) {
    $('body-label').textContent = f.body
    $('body').placeholder = f.bodyPh
    $('body').classList.toggle('code', !!f.code)
  }
  // Design needs a picture: no «Без скриншота» there.
  $('shot-mode').querySelector('[data-mode="none"]').style.display = f.shotRequired ? 'none' : ''
  if (!state.modeTouched || (f.shotRequired && state.mode === 'none')) {
    state.mode = f.shot
    if (state.mode === 'visible' && !state.screenshot) void captureVisible()
  }
  renderKinds()
  renderMode()
}

function renderKinds() {
  const box = $('kinds')
  box.replaceChildren()
  for (const [id, label] of KINDS) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'chip'
    b.textContent = label
    b.setAttribute('aria-pressed', String(state.kind === id))
    b.addEventListener('click', () => {
      state.kind = id
      renderKinds()
    })
    box.append(b)
  }
}

function parseTags(value) {
  return [...new Set(value.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 20)
}

/* ───────── page data ───────── */

async function captureVisible() {
  try {
    state.screenshot = await chrome.tabs.captureVisibleTab(state.tab.windowId, { format: 'png' })
  } catch (e) {
    state.screenshot = null
    setError(`Не вдалося зробити скриншот: ${e.message || e}`)
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
  if (isRestricted(state.tab.url)) {
    setError('На цій сторінці виділення області недоступне — скористайтеся «Видима область».')
    state.mode = 'visible'
    renderMode()
    return
  }
  await saveDraft()
  try {
    await chrome.scripting.executeScript({ target: { tabId: state.tab.id }, files: ['select.js'] })
    window.close() // the overlay needs the page; the popup reopens when the area is captured
  } catch (e) {
    setError(`Не вдалося почати виділення: ${e.message || e}`)
  }
}

/* ───────── save ───────── */

async function save() {
  if (state.saving) return
  setError('')
  state.saving = true
  $('save').disabled = true
  $('save').textContent = 'Зберігаю…'
  const tags = parseTags($('tags').value)
  const res = await vaultFetch('/capture', {
    method: 'POST',
    body: {
      target: state.target,
      url: state.tab.url,
      title: $('title').value.trim(),
      note: $('note').value.trim(),
      tags,
      screenshot: state.mode === 'none' ? null : state.screenshot,
      selection: FIELDS[state.target].body ? $('body').value : '',
      company: state.target === 'application' ? $('company').value.trim() : '',
      kind: state.target === 'bookmark' ? state.kind : undefined
    }
  })
  state.saving = false
  $('save').disabled = false
  $('save').textContent = 'Зберегти у Vault'
  if (!res.ok) {
    setError(res.error)
    return
  }
  await Promise.all([rememberTarget(), rememberTags(tags), chrome.storage.session.remove([draftKey(), areaKey()])])
  await chrome.action.setBadgeText({ tabId: state.tab.id, text: '' })
  $('form').style.display = 'none'
  $('done').style.display = 'flex'
  $('done-title').textContent = res.title || $('title').value
  $('done-type').textContent = `${TARGET_LABEL[state.target]}: збережено у Vault`
  // Closes itself unless the user goes back to save something else from this tab.
  state.closeTimer = setTimeout(() => window.close(), 4000)
}

/* ───────── init ───────── */

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  state.tab = tab
  if (!tab?.url) {
    setError('Не вдалося прочитати поточну вкладку')
    return
  }

  const stored = await chrome.storage.session.get([draftKey(), areaKey()])
  const draft = stored[draftKey()]?.url === tab.url ? stored[draftKey()] : null
  const area = stored[areaKey()]?.url === tab.url ? stored[areaKey()] : null
  const { targets = {} } = await chrome.storage.local.get('targets')

  state.target = draft?.target || targets[hostOf(tab.url)] || suggestTarget(tab.url)
  $('title').value = draft?.title ?? (tab.title || '')
  $('note').value = draft?.note ?? ''
  $('tags').value = draft?.tags ?? ''
  $('body').value = draft?.selection ?? (await readSelection())
  $('company').value = draft?.company ?? ''
  state.kind = draft?.kind ?? guessKind(tab.url)
  state.modeTouched = !!draft?.modeTouched

  renderTargets()
  void renderRecentTags()

  if (area) {
    state.mode = 'area'
    state.screenshot = area.dataUrl
    renderMode()
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' })
  } else {
    state.mode = 'visible'
    void captureVisible()
  }
  // After the area capture the mode stays «area»; otherwise the type decides.
  if (area) state.modeTouched = true
  renderFields()

  const ping = await vaultFetch('/ping')
  if (ping.ok) setStatus('ok', 'Vault під’єднано')
  else setStatus('bad', ping.error)

  $('title').focus()
}

$('shot-mode').addEventListener('click', (e) => {
  const mode = e.target?.dataset?.mode
  if (!mode) return
  setError('')
  state.modeTouched = true
  if (mode === 'area') return void startAreaSelection()
  state.mode = mode
  if (mode === 'visible' && !state.screenshot) void captureVisible()
  renderMode()
})
$('save').addEventListener('click', () => void save())
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage())
// The red «no key / no connection» banner leads straight to the fix.
$('status').addEventListener('click', () => $('status').dataset.state === 'bad' && chrome.runtime.openOptionsPage())
$('close').addEventListener('click', () => window.close())
$('back').addEventListener('click', () => {
  clearTimeout(state.closeTimer)
  $('done').style.display = 'none'
  $('form').style.display = ''
  $('note').value = ''
  $('body').value = ''
  $('title').focus()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
})

void init()
