/**
 * Pairing the browser extension without copying the key: the extension asks (POST /pair), the person answers
 * in Vault («Дозволити» / «Відхилити»), the extension polls and gets the key only after «Дозволити».
 *
 * Rules (all enforced here, the HTTP layer only maps them to responses):
 * - only browser-extension origins may ask (chrome-extension://<32 a–p>, moz-extension://<uuid>);
 * - ONE request at a time: a new one replaces the old (the old id stops working);
 * - a request expires after `ttlMs` (60 s); an answer for a replaced or expired id is refused;
 * - asking is rate-limited (a gap between requests and a cap per minute);
 * - the result is handed out once, to the origin that asked; then the request is forgotten.
 * No Electron here: pure state with an injected clock and id source, covered by unit tests.
 */
import { createHash, randomBytes } from 'crypto'

export const PAIR_TTL_MS = 60_000
/** After «Дозволити» the extension still has this long to collect the key, even at the very end of the minute. */
const DELIVERY_GRACE_MS = 15_000

const CHROME_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/
const MOZ_ORIGIN =
  /^moz-extension:\/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An origin only a browser extension can have (a web page cannot set its own Origin header). */
export function isExtensionOrigin(origin: unknown): origin is string {
  return typeof origin === 'string' && (CHROME_ORIGIN.test(origin) || MOZ_ORIGIN.test(origin))
}

/**
 * Chrome's extension id from the manifest `key` (base64 DER public key): the first 128 bits of its SHA-256,
 * each hex digit written as a–p. The same id Chrome shows on chrome://extensions for an unpacked copy.
 */
export function extensionIdFromKey(key: string): string | null {
  const der = Buffer.from(key.replace(/\s+/g, ''), 'base64')
  if (der.length < 64) return null
  return createHash('sha256')
    .update(der)
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)))
}

export type PairStatus = 'waiting' | 'approved' | 'denied'

export interface PairRequest {
  id: string
  origin: string
  createdAt: number
  expiresAt: number
  status: PairStatus
}

/** What the extension's poll learns; `approved` is said once (the HTTP layer adds the key to it). */
export type PairPoll =
  | { state: 'waiting'; expiresIn: number }
  | { state: 'approved' }
  | { state: 'denied' }
  | { state: 'expired' }

export type PairOpen =
  { ok: true; id: string; expiresIn: number } | { ok: false; reason: 'origin' | 'rate' }

export interface PairingOptions {
  ttlMs?: number
  /** Minimum pause between two requests (a double click is one request). */
  minGapMs?: number
  /** Requests allowed in any 60 s. */
  perMinute?: number
  now?: () => number
  newId?: () => string
}

type Listener = (pending: PairRequest | null) => void

export class PairingBroker {
  private request: PairRequest | null = null
  private recent: number[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<Listener>()
  private readonly ttlMs: number
  private readonly minGapMs: number
  private readonly perMinute: number
  private readonly now: () => number
  private readonly newId: () => string

  constructor(opts: PairingOptions = {}) {
    this.ttlMs = opts.ttlMs ?? PAIR_TTL_MS
    this.minGapMs = opts.minGapMs ?? 1_000
    this.perMinute = opts.perMinute ?? 6
    this.now = opts.now ?? Date.now
    // 72 random bits, URL-safe: short enough for a path, not guessable within a minute.
    this.newId = opts.newId ?? (() => randomBytes(9).toString('base64url'))
  }

  /** The request waiting for the person's answer (the dialog shows it), or null. */
  pending(): PairRequest | null {
    this.expireIfDue()
    return this.request?.status === 'waiting' ? { ...this.request } : null
  }

  /** «Під’єднати до Vault» in the extension. Replaces an earlier request, whoever made it. */
  open(origin: unknown): PairOpen {
    if (!isExtensionOrigin(origin)) return { ok: false, reason: 'origin' }
    const now = this.now()
    this.recent = this.recent.filter((t) => now - t < 60_000)
    const last = this.recent.at(-1)
    if ((last !== undefined && now - last < this.minGapMs) || this.recent.length >= this.perMinute)
      return { ok: false, reason: 'rate' }
    this.recent.push(now)
    this.request = {
      id: this.newId(),
      origin,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      status: 'waiting'
    }
    this.schedule(this.ttlMs)
    this.notify()
    return { ok: true, id: this.request.id, expiresIn: this.ttlMs }
  }

  /**
   * The person's answer for request `id`. False when that request is no longer the waiting one (replaced,
   * expired, already answered): a click on a dialog that changed under the cursor never approves the new one.
   */
  answer(id: string, allow: boolean): boolean {
    this.expireIfDue()
    const r = this.request
    if (!r || r.id !== id || r.status !== 'waiting') return false
    r.status = allow ? 'approved' : 'denied'
    if (allow) {
      r.expiresAt = Math.max(r.expiresAt, this.now() + DELIVERY_GRACE_MS)
      this.schedule(r.expiresAt - this.now())
    }
    this.notify()
    return true
  }

  /** The extension's poll: only the origin that asked learns anything; a final answer is given once. */
  poll(id: string, origin: unknown): PairPoll {
    this.expireIfDue()
    const r = this.request
    if (!r || r.id !== id || r.origin !== origin) return { state: 'expired' }
    if (r.status === 'waiting') return { state: 'waiting', expiresIn: r.expiresAt - this.now() }
    this.clear()
    return { state: r.status }
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Forgets the request (the server stopped). */
  dispose(): void {
    this.clear()
  }

  private expireIfDue(): void {
    if (this.request && this.now() >= this.request.expiresAt) this.clear()
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const hadWaiting = this.request?.status === 'waiting'
    this.request = null
    if (hadWaiting) this.notify()
  }

  /** The dialog must close by itself when time runs out, not on the next poll. */
  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.expireIfDue(), Math.max(0, ms))
    this.timer.unref?.()
  }

  private notify(): void {
    const pending = this.request?.status === 'waiting' ? { ...this.request } : null
    for (const l of this.listeners) l(pending)
  }
}
