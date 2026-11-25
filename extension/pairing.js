// «Під’єднати до Vault» without copying the key. Runs in the service worker: the popup closes as soon as the
// Vault window comes up for «Дозволити», so the waiting and the polling cannot live in the popup.
//
// POST /pair        → Vault shows «Дозволити розширенню доступ?»; answers { id, expiresIn }.
// POST /pair/<id>   → waiting | approved (+ key) | denied | expired. POST, not GET: Chrome sends the Origin
//                     header (which Vault checks) on an extension's GET only when the host is not permitted.
// The state lives in chrome.storage.session under PAIR_KEY; the popup renders it and follows its changes.
import { getConnection } from './shared.js'

export const PAIR_KEY = 'pairing'
const POLL_MS = 1000

const OFFLINE = (port) =>
  `Немає зв’язку з Vault (порт ${port}). Запустіть Vault і спробуйте ще раз.`
const FAILED = 'Не вдалося надіслати запит. Спробуйте ще раз.'

/** The pairing id being polled by this worker (null — none). */
let polling = null

export async function getPairing() {
  return (await chrome.storage.session.get(PAIR_KEY))[PAIR_KEY] ?? null
}

async function setPairing(value) {
  await chrome.storage.session.set({ [PAIR_KEY]: { ...value, at: Date.now() } })
}

/** One request to the bridge without the key; null when Vault does not answer. */
async function bridge(port, path) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000)
    })
    let data = {}
    try {
      data = await res.json()
    } catch {
      /* not JSON: not Vault */
    }
    return { status: res.status, data }
  } catch {
    return null
  }
}

/** Asks Vault for access and starts polling. Returns the new state for the popup. */
export async function startPairing() {
  const { port } = await getConnection()
  const res = await bridge(port, '/pair')
  let next
  if (!res) next = { state: 'error', error: OFFLINE(port) }
  // A Vault before 0.3 has no pairing: the key goes in by hand.
  else if (res.status === 404 || res.status === 401) next = { state: 'unsupported' }
  else if (res.status !== 200 || typeof res.data.id !== 'string')
    next = { state: 'error', error: res.data.error || FAILED }
  else {
    const expiresIn = Number(res.data.expiresIn) > 0 ? Number(res.data.expiresIn) : 60_000
    next = { state: 'waiting', id: res.data.id, port, expiresAt: Date.now() + expiresIn }
  }
  await setPairing(next)
  if (next.state === 'waiting') void watchPairing(next)
  return next
}

/** Stops waiting (the popup's «Скасувати»): the request in Vault simply expires. */
export async function cancelPairing() {
  polling = null
  await chrome.storage.session.remove(PAIR_KEY)
}

/**
 * Polls a waiting request until it is answered or expires. Safe to call again (a reopened popup does, in case
 * Chrome stopped the worker): one loop per id. Each round reads the stored state — an extension API call
 * keeps the worker alive — and stops when the popup cancelled or a newer request replaced this one.
 */
export async function watchPairing(pairing) {
  if (!pairing || pairing.state !== 'waiting' || polling === pairing.id) return
  polling = pairing.id
  const id = pairing.id
  while (polling === id) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    const current = await getPairing()
    if (polling !== id || current?.id !== id || current.state !== 'waiting') break
    // A couple of seconds past the deadline: Vault's clock and ours are the same machine, but polls take time.
    if (Date.now() > pairing.expiresAt + 2000) {
      await finish(id, { state: 'expired' })
      break
    }
    const res = await bridge(pairing.port, `/pair/${encodeURIComponent(id)}`)
    // Vault busy or restarting: keep asking until the deadline.
    if (!res || res.status !== 200) continue
    const { state, key } = res.data
    if (state === 'waiting') continue
    if (state === 'approved' && typeof key === 'string' && key) {
      await chrome.storage.local.set({ key, port: pairing.port })
      await finish(id, { state: 'approved' })
    } else await finish(id, { state: state === 'denied' ? 'denied' : 'expired' })
    break
  }
  if (polling === id) polling = null
}

async function finish(id, next) {
  const current = await getPairing()
  if (current?.id !== id) return
  await setPairing(next)
  // Chrome 127+: the popup comes back by itself with «Під’єднано»; older ones — the person clicks the icon.
  if (next.state === 'approved') await chrome.action.openPopup().catch(() => {})
}
