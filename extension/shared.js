// Shared helpers for popup, options and the service worker. No external code.
import { looksLikeCode } from './code-language.js'

export const DEFAULT_PORT = 47219

/**
 * Two rows of four in the popup: code and errors first, pages and inspiration under them.
 * Bridges older than extension 0.2 know only LEGACY_TARGETS.
 */
export const TARGETS = [
  { id: 'snippet', label: 'Сніпет' },
  { id: 'component', label: 'Компонент' },
  { id: 'library', label: 'Бібліотека' },
  { id: 'fix', label: 'Помилка' },
  { id: 'bookmark', label: 'Закладка' },
  { id: 'note', label: 'Нотатка' },
  { id: 'design', label: 'Дизайн' },
  { id: 'application', label: 'Вакансія' }
]

/** What a bridge without the `targets` list in /ping accepts. */
export const LEGACY_TARGETS = ['design', 'bookmark', 'library', 'component', 'application']

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

const SETTINGS_HINT = 'Налаштування → «Розширення для Chrome»'
const SAVE_FAILED = 'Не вдалося зберегти. Спробуйте ще раз.'
const NO_KEY = `Немає ключа. Скопіюйте його у Vault: ${SETTINGS_HINT}.`

/**
 * Calls the local Vault bridge. Never talks to anything but 127.0.0.1.
 * Every request has a deadline: a hung Vault or a foreign process on the port must not leave «Зберігаю…» forever.
 * `fallback` is the error when Vault refuses without saying why.
 * Without a key only /ping goes out (it finds Vault): its 401 says whether this Vault can pair (`pairing`).
 */
export async function vaultFetch(
  path,
  { method = 'GET', body, timeout = method === 'GET' ? 3000 : 30_000, fallback = SAVE_FAILED } = {}
) {
  const { port, key } = await getConnection()
  if (!key && path !== '/ping') return { ok: false, status: 'nokey', error: NO_KEY }
  let res
  try {
    res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Vault-Key': key } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout)
    })
  } catch (e) {
    if (e?.name === 'TimeoutError')
      return {
        ok: false,
        status: 'timeout',
        error: 'Vault не відповідає. Спробуйте ще раз за хвилину.'
      }
    return {
      ok: false,
      status: 'offline',
      error: `Немає зв’язку з Vault (порт ${port}). Запустіть його й перевірте в ньому ${SETTINGS_HINT}.`
    }
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* empty or non-JSON body */
  }
  if (res.status === 401)
    return {
      ok: false,
      status: key ? 'unauthorized' : 'nokey',
      // Vault 0.3+ answers «I am here, pair with me»: the popup offers «Під’єднати до Vault» instead of the key.
      pairing: data.app === 'vault' && Number(data.pair) >= 1,
      error: key
        ? data.error || `Ключ не підходить. Скопіюйте новий у Vault: ${SETTINGS_HINT}.`
        : NO_KEY
    }
  if (path === '/ping' && data.app !== 'vault') {
    return {
      ok: false,
      status: 'offline',
      error: `На порту ${port} відповідає не Vault — перевірте порт у налаштуваннях розширення.`
    }
  }
  if (!res.ok || data.ok === false)
    return {
      ok: false,
      status: 'error',
      error: data.error || fallback
    }
  return { ok: true, status: 'ok', ...data }
}

/** «0.3.10» > «0.3.9»: manifest versions are 1–4 dot-separated integers. */
export function isNewerVersion(candidate, current) {
  const a = String(candidate ?? '')
    .split('.')
    .map(Number)
  const b = String(current ?? '')
    .split('.')
    .map(Number)
  if (a.some((n) => !Number.isInteger(n)) || b.some((n) => !Number.isInteger(n))) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return d > 0
  }
  return false
}

/**
 * Vault's folder holds a newer extension (`/ping` → `extension`): reload to pick it up, at most once per
 * version. 'reload' — do it now; 'stale' — already reloaded for it and still older: Chrome loads another
 * folder (the repo, an old install dir), reloading again would loop; null — nothing to do.
 */
export function updateAction(vaultVersion, currentVersion, reloadedFor) {
  if (!isNewerVersion(vaultVersion, currentVersion)) return null
  return reloadedFor === vaultVersion ? 'stale' : 'reload'
}

/**
 * Reloads the extension for Vault's newer copy. storage.session (drafts typed in the popup) does not survive
 * a reload: the drafts wait in storage.local and the worker puts them back on its next start (restoreAfterReload).
 * Area pictures stay behind (megabytes; a new selection takes a second).
 */
export async function reloadForUpdate(version) {
  const all = await chrome.storage.session.get(null)
  const drafts = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('draft:')))
  await chrome.storage.local.set({ reloadedFor: version, stash: drafts, reopenPopup: true })
  chrome.runtime.reload()
}

/** Service worker start: drafts kept by reloadForUpdate come back, and the popup reopens where it was. */
export async function restoreAfterReload() {
  const { stash, reopenPopup } = await chrome.storage.local.get(['stash', 'reopenPopup'])
  if (!stash && !reopenPopup) return
  await chrome.storage.local.remove(['stash', 'reopenPopup'])
  if (stash && typeof stash === 'object') await chrome.storage.session.set(stash)
  // Chrome 127+; older ones — the person clicks the icon (the update screen said so).
  if (reopenPopup) await chrome.action.openPopup().catch(() => {})
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
  // The record exists: a failed cleanup (say, the tab is already closed) must not report «не вдалося зберегти».
  const results = await Promise.allSettled([
    rememberTarget(body.url, body.target),
    rememberTags(body.tags),
    chrome.storage.session.remove([`draft:${tabId}`, `area:${tabId}`, `area-error:${tabId}`]),
    chrome.action.setBadgeText({ tabId, text: '' })
  ])
  for (const r of results)
    if (r.status === 'rejected') console.error('[vault capture] after-save', r.reason)
  return res
}

/** { host without «www.», path } of a page, or null for a broken URL: one parser for every guess below. */
export function urlParts(rawUrl) {
  try {
    const u = new URL(rawUrl)
    return { host: u.hostname.replace(/^www\./, ''), path: u.pathname }
  } catch {
    return null
  }
}

/** Q&A sites of the Stack Exchange network: their titles carry a tag prefix and the site name. */
export function isQaSite(host) {
  return /(^|\.)(stackoverflow\.com|stackexchange\.com|superuser\.com|serverfault\.com|askubuntu\.com)$/.test(
    host
  )
}

/** Pages where a selection is most likely code: gists, files on GitHub, Stack Overflow answers. */
function isCodeSite({ host, path }) {
  return (
    host === 'gist.github.com' ||
    (host === 'github.com' && /^\/[^/]+\/[^/]+\/(blob|blame)\//.test(path)) ||
    isQaSite(host)
  )
}

/** Suggests a target from the page URL and, on code sites, from what is selected. */
export function suggestTarget(rawUrl, selection = '') {
  const parts = urlParts(rawUrl)
  if (!parts) return 'bookmark'
  const { host, path } = parts
  if (selection && isCodeSite(parts) && looksLikeCode(selection)) return 'snippet'
  if (host === 'npmjs.com' || host.endsWith('.npmjs.com')) return 'library'
  if (host === 'github.com' && /^\/[^/]+\/[^/]+\/?$/.test(path)) return 'library'
  if (/(^|\.)djinni\.co$|(^|\.)dou\.ua$|(^|\.)work\.ua$|(^|\.)robota\.ua$/.test(host))
    return 'application'
  if (host.endsWith('linkedin.com') && path.startsWith('/jobs')) return 'application'
  if (
    /dribbble\.com|behance\.net|awwwards\.com|land-book\.com|mobbin\.com|godly\.website|lapa\.ninja|siteinspire\.com/.test(
      host
    )
  )
    return 'design'
  if (
    /ui\.shadcn\.com|21st\.dev|tailwindui\.com|uiverse\.io|magicui\.design|aceternity\.com|codepen\.io/.test(
      host
    )
  )
    return 'component'
  return 'bookmark'
}

export function hostOf(rawUrl) {
  return urlParts(rawUrl)?.host ?? ''
}

/** Pages where scripts can't be injected (chrome://, Web Store, other extensions…). */
export function isRestricted(rawUrl) {
  return (
    !/^https?:\/\//.test(rawUrl || '') ||
    /^https:\/\/chromewebstore\.google\.com|^https:\/\/chrome\.google\.com\/webstore/.test(rawUrl)
  )
}
