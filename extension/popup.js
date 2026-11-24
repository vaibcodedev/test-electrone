import { TARGETS, hostOf, isRestricted, suggestTarget, vaultFetch } from './shared.js'

const $ = (id) => document.getElementById(id)
const TARGET_LABEL = Object.fromEntries(TARGETS.map((t) => [t.id, t.label]))

const state = {
  tab: null,
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
      selection: state.selection
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
      renderSelectionHint()
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

function renderSelectionHint() {
  const n = state.selection.trim().length
  const useful = state.target === 'application' || state.target === 'component' || state.target === 'bookmark'
  $('selection-hint').textContent = n && useful ? `Выделенный на странице текст (${n} симв.) добавится как ${state.target === 'component' ? 'код' : 'описание'}.` : ''
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
    setError(`Не удалось сделать скриншот: ${e.message || e}`)
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
    setError('На этой странице выделение области недоступно — используйте «Видимая область».')
    state.mode = 'visible'
    renderMode()
    return
  }
  await saveDraft()
  try {
    await chrome.scripting.executeScript({ target: { tabId: state.tab.id }, files: ['select.js'] })
    window.close() // the overlay needs the page; the popup reopens when the area is captured
  } catch (e) {
    setError(`Не удалось начать выделение: ${e.message || e}`)
  }
}

/* ───────── save ───────── */

async function save() {
  if (state.saving) return
  setError('')
  state.saving = true
  $('save').disabled = true
  $('save').textContent = 'Сохраняю…'
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
      selection: state.selection
    }
  })
  state.saving = false
  $('save').disabled = false
  $('save').textContent = 'Сохранить в Vault'
  if (!res.ok) {
    setError(res.error)
    return
  }
  await Promise.all([rememberTarget(), rememberTags(tags), chrome.storage.session.remove([draftKey(), areaKey()])])
  await chrome.action.setBadgeText({ tabId: state.tab.id, text: '' })
  $('form').style.display = 'none'
  $('done').style.display = 'flex'
  $('done-title').textContent = res.title || $('title').value
  $('done-type').textContent = `${TARGET_LABEL[state.target]} сохранено в Vault`
  setTimeout(() => window.close(), 2500)
}

/* ───────── init ───────── */

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  state.tab = tab
  if (!tab?.url) {
    setError('Не удалось прочитать текущую вкладку')
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
  state.selection = draft?.selection ?? (await readSelection())

  renderTargets()
  renderSelectionHint()
  void renderRecentTags()

  if (area) {
    state.mode = 'area'
    state.screenshot = area.dataUrl
    renderMode()
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' })
  } else {
    state.mode = 'visible'
    renderMode()
    void captureVisible()
  }

  const ping = await vaultFetch('/ping')
  if (ping.ok) setStatus('ok', 'Vault подключён')
  else setStatus('bad', ping.error)

  $('title').focus()
}

$('shot-mode').addEventListener('click', (e) => {
  const mode = e.target?.dataset?.mode
  if (!mode) return
  setError('')
  if (mode === 'area') return void startAreaSelection()
  state.mode = mode
  if (mode === 'visible' && !state.screenshot) void captureVisible()
  renderMode()
})
$('save').addEventListener('click', () => void save())
$('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage())
$('close').addEventListener('click', () => window.close())
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save()
})

void init()
