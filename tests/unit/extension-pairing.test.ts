import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, generateKeyPairSync } from 'crypto'
import { readFileSync } from 'fs'
import {
  extensionIdFromKey,
  isExtensionOrigin,
  PAIR_TTL_MS,
  PairingBroker
} from '@main/services/extension-pairing'

const CHROME = `chrome-extension://${'a'.repeat(32)}`
const OTHER = `chrome-extension://${'b'.repeat(32)}`

describe('isExtensionOrigin', () => {
  it('takes Chrome and Firefox extension origins only', () => {
    expect(isExtensionOrigin(CHROME)).toBe(true)
    expect(isExtensionOrigin('moz-extension://0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b')).toBe(true)
    for (const bad of [
      undefined,
      '',
      'null',
      'https://evil.example',
      'http://127.0.0.1:47219',
      'chrome-extension://short',
      `chrome-extension://${'z'.repeat(32)}`, // ids use a–p only
      `${CHROME}/popup.html`,
      `chrome-extension://${'a'.repeat(32)}.evil.example`
    ])
      expect(isExtensionOrigin(bad), String(bad)).toBe(false)
  })
})

describe('extensionIdFromKey', () => {
  it('derives Chrome’s id: SHA-256 of the key, first 32 hex digits as a–p', () => {
    const der = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({
      type: 'spki',
      format: 'der'
    })
    const hex = createHash('sha256').update(der).digest('hex').slice(0, 32)
    const id = extensionIdFromKey(der.toString('base64'))
    expect(id).toMatch(/^[a-p]{32}$/)
    expect([...id!].map((c) => (c.charCodeAt(0) - 97).toString(16)).join('')).toBe(hex)
  })

  it('pins the shipped extension to a stable id', () => {
    const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8')) as { key: string }
    expect(extensionIdFromKey(manifest.key)).toBe('ighcmeieigdefhjpidfbcainaoopopbk')
  })

  it('refuses garbage', () => {
    expect(extensionIdFromKey('')).toBeNull()
    expect(extensionIdFromKey('abc')).toBeNull()
  })
})

describe('PairingBroker', () => {
  let ids = 0
  const broker = (opts: ConstructorParameters<typeof PairingBroker>[0] = {}): PairingBroker =>
    new PairingBroker({ newId: () => `id${++ids}`, ...opts })

  beforeEach(() => {
    vi.useFakeTimers()
    ids = 0
  })
  afterEach(() => vi.useRealTimers())

  it('refuses origins that are not extensions', () => {
    const b = broker()
    expect(b.open('https://evil.example')).toEqual({ ok: false, reason: 'origin' })
    expect(b.open(undefined)).toEqual({ ok: false, reason: 'origin' })
    expect(b.pending()).toBeNull()
  })

  it('waits for the person: no key before «Дозволити», then once to the asking origin', () => {
    const b = broker()
    const changes: (string | null)[] = []
    b.onChange((p) => changes.push(p?.id ?? null))
    const r = b.open(CHROME)
    expect(r).toEqual({ ok: true, id: 'id1', expiresIn: PAIR_TTL_MS })
    expect(b.pending()).toMatchObject({ id: 'id1', origin: CHROME, status: 'waiting' })
    expect(b.poll('id1', CHROME)).toEqual({ state: 'waiting', expiresIn: PAIR_TTL_MS })
    // Another extension cannot learn anything about this request.
    expect(b.poll('id1', OTHER)).toEqual({ state: 'expired' })
    expect(b.answer('id1', true)).toBe(true)
    expect(b.pending()).toBeNull()
    expect(b.poll('id1', OTHER)).toEqual({ state: 'expired' })
    expect(b.poll('id1', CHROME)).toEqual({ state: 'approved' })
    // Handed out once.
    expect(b.poll('id1', CHROME)).toEqual({ state: 'expired' })
    expect(changes).toEqual(['id1', null])
  })

  it('tells a refusal once', () => {
    const b = broker()
    b.open(CHROME)
    expect(b.answer('id1', false)).toBe(true)
    expect(b.poll('id1', CHROME)).toEqual({ state: 'denied' })
    expect(b.poll('id1', CHROME)).toEqual({ state: 'expired' })
  })

  it('keeps one request: a new one replaces the old, whose answer is refused', () => {
    const b = broker()
    b.open(CHROME)
    vi.advanceTimersByTime(2000)
    b.open(OTHER)
    expect(b.pending()?.id).toBe('id2')
    // The dialog still showed id1 when the person clicked: the new request is not approved by it.
    expect(b.answer('id1', true)).toBe(false)
    expect(b.pending()).toMatchObject({ id: 'id2', status: 'waiting' })
    expect(b.poll('id1', CHROME)).toEqual({ state: 'expired' })
  })

  it('expires after a minute and closes the dialog by itself', () => {
    const b = broker()
    const changes: (string | null)[] = []
    b.onChange((p) => changes.push(p?.id ?? null))
    b.open(CHROME)
    vi.advanceTimersByTime(PAIR_TTL_MS - 1)
    expect(b.pending()?.id).toBe('id1')
    vi.advanceTimersByTime(1)
    expect(changes).toEqual(['id1', null])
    expect(b.pending()).toBeNull()
    expect(b.answer('id1', true)).toBe(false)
    expect(b.poll('id1', CHROME)).toEqual({ state: 'expired' })
  })

  it('lets a late «Дозволити» be collected', () => {
    const b = broker()
    b.open(CHROME)
    vi.advanceTimersByTime(PAIR_TTL_MS - 100)
    expect(b.answer('id1', true)).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(b.poll('id1', CHROME)).toEqual({ state: 'approved' })
  })

  it('rate-limits asking: a gap between requests and a cap per minute', () => {
    const b = broker({ minGapMs: 1000, perMinute: 3 })
    expect(b.open(CHROME).ok).toBe(true)
    expect(b.open(CHROME)).toEqual({ ok: false, reason: 'rate' })
    vi.advanceTimersByTime(1000)
    expect(b.open(CHROME).ok).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(b.open(CHROME).ok).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(b.open(CHROME)).toEqual({ ok: false, reason: 'rate' })
    vi.advanceTimersByTime(60_000)
    expect(b.open(CHROME).ok).toBe(true)
  })

  it('forgets everything on dispose', () => {
    const b = broker()
    b.open(CHROME)
    b.dispose()
    expect(b.pending()).toBeNull()
    expect(b.answer('id1', true)).toBe(false)
  })
})
