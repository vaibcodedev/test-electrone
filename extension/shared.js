// Shared helpers for popup, options and the service worker. No external code.

export const DEFAULT_PORT = 47219

export const TARGETS = [
  { id: 'design', label: 'Дизайн' },
  { id: 'bookmark', label: 'Закладка' },
  { id: 'library', label: 'Библиотека' },
  { id: 'component', label: 'Компонент' },
  { id: 'application', label: 'Вакансия' }
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

/** Calls the local Vault bridge. Never talks to anything but 127.0.0.1. */
export async function vaultFetch(path, { method = 'GET', body } = {}) {
  const { port, key } = await getConnection()
  if (!key) return { ok: false, status: 'nokey', error: 'Нет ключа — откройте настройки расширения' }
  let res
  try {
    res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Vault-Key': key },
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    return { ok: false, status: 'offline', error: 'Vault не запущен' }
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  if (res.status === 401) return { ok: false, status: 'unauthorized', error: 'Неверный ключ — откройте настройки' }
  if (!res.ok || data.ok === false) return { ok: false, status: 'error', error: data.error || `Ошибка ${res.status}` }
  return { ok: true, status: 'ok', ...data }
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
