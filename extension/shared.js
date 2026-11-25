// Shared helpers for popup, options and the service worker. No external code.

export const DEFAULT_PORT = 47219

export const TARGETS = [
  { id: 'design', label: 'Дизайн' },
  { id: 'bookmark', label: 'Закладка' },
  { id: 'library', label: 'Бібліотека' },
  { id: 'component', label: 'Компонент' },
  { id: 'application', label: 'Вакансія' }
]

/** Reads { port, key } from storage; port is always a valid number. */
export async function getConnection() {
  const { port, key } = await chrome.storage.local.get(['port', 'key'])
  return { port: validPort(port) ?? DEFAULT_PORT, key: typeof key === 'string' ? key.trim() : '' }
}

export function validPort(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : null
}

/** Error under a field (`#<id>-error`) plus aria-invalid on it; an empty text clears both. Popup and options only. */
export function setFieldError(id, text) {
  document.getElementById(`${id}-error`).textContent = text || ''
  if (text) document.getElementById(id).setAttribute('aria-invalid', 'true')
  else document.getElementById(id).removeAttribute('aria-invalid')
}

const SETTINGS_HINT ='Налаштування → «Розширення для Chrome»'

/**
 * Calls the local Vault bridge. Never talks to anything but 127.0.0.1.
 * Every request has a deadline: a hung Vault or a foreign process on the port must not leave «Зберігаю…» forever.
 */
export async function vaultFetch(path, { method = 'GET', body, timeout = method === 'GET' ? 3000 : 30_000 } = {}) {
  const { port, key } = await getConnection()
  if (!key) return { ok: false, status: 'nokey', error: `Немає ключа. Скопіюйте його у Vault: ${SETTINGS_HINT}.` }
  let res
  try {
    res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Vault-Key': key },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout)
    })
  } catch (e) {
    if (e?.name === 'TimeoutError') return { ok: false, status: 'timeout', error: 'Vault не відповідає. Спробуйте ще раз за хвилину.' }
    return {
      ok: false,
      status: 'offline',
      error: `Немає зв’язку з Vault на порту ${port}. Запустіть Vault (досить іконки в треї) і перевірте в ${SETTINGS_HINT}, що приймання даних увімкнено й порт збігається.`
    }
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* empty or non-JSON body */
  }
  if (res.status === 401) return { ok: false, status: 'unauthorized', error: data.error || `Ключ не підходить. Скопіюйте новий у Vault: ${SETTINGS_HINT}.` }
  if (path === '/ping' && data.app !== 'vault') {
    return { ok: false, status: 'offline', error: `На порту ${port} відповідає не Vault — перевірте порт у налаштуваннях розширення.` }
  }
  if (!res.ok || data.ok === false) return { ok: false, status: 'error', error: data.error || 'Не вдалося зберегти. Спробуйте ще раз.' }
  return { ok: true, status: 'ok', ...data }
}

/** Statuses that mean «no working connection» rather than «this record was refused». */
export const CONNECTION_PROBLEMS = ['nokey', 'unauthorized', 'offline', 'timeout']

/** An area capture older than this is not offered any more (the page has likely changed). */
export const AREA_TTL = 10 * 60 * 1000

async function rememberTarget(url, target) {
  const host = hostOf(url)
  if (!host) return
  const { targets = {} } = await chrome.storage.local.get('targets')
  targets[host] = target
  await chrome.storage.local.set({ targets })
}

async function rememberTags(tags) {
  const { recentTags = [] } = await chrome.storage.local.get('recentTags')
  const next = [...tags, ...recentTags.filter((t) => !tags.includes(t))].slice(0, 12)
  await chrome.storage.local.set({ recentTags: next })
}

/**
 * Sends a capture and, on success, clears the tab's draft, area and badge.
 * Runs in the service worker: the popup may close mid-request, and a leftover draft would invite a duplicate save.
 */
export async function sendCapture(tabId, body) {
  const res = await vaultFetch('/capture', { method: 'POST', body })
  if (!res.ok) return res
  await Promise.all([
    rememberTarget(body.url, body.target),
    rememberTags(body.tags),
    chrome.storage.session.remove([`draft:${tabId}`, `area:${tabId}`, `area-error:${tabId}`]),
    chrome.action.setBadgeText({ tabId, text: '' })
  ])
  return res
}

/** Suggests a target from the page URL. */
export function suggestTarget(rawUrl) {
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    return 'bookmark'
  }
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname
  if (host === 'npmjs.com' || host.endsWith('.npmjs.com')) return 'library'
  if (host === 'github.com' && /^\/[^/]+\/[^/]+\/?$/.test(path)) return 'library'
  if (/(^|\.)djinni\.co$|(^|\.)dou\.ua$|(^|\.)work\.ua$|(^|\.)robota\.ua$/.test(host)) return 'application'
  if (host.endsWith('linkedin.com') && path.startsWith('/jobs')) return 'application'
  if (/dribbble\.com|behance\.net|awwwards\.com|land-book\.com|mobbin\.com|godly\.website|lapa\.ninja|siteinspire\.com/.test(host)) return 'design'
  if (/ui\.shadcn\.com|21st\.dev|tailwindui\.com|uiverse\.io|magicui\.design|aceternity\.com|codepen\.io/.test(host)) return 'component'
  return 'bookmark'
}

export function hostOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Pages where scripts can't be injected (chrome://, Web Store, other extensions…). */
export function isRestricted(rawUrl) {
  return !/^https?:\/\//.test(rawUrl || '') || /^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/.test(rawUrl)
}
