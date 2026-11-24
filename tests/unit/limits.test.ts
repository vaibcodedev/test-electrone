import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { MAX } from '@shared/domain/limits'
import { ideaInputSchema } from '@shared/domain/ideas'
import { proposalInputSchema } from '@shared/domain/freelance'
import { withdrawalInputSchema } from '@shared/domain/finance'
import { isLikelyUrl, limitsOf, rangesOf } from '@/lib/limits'

describe('limitsOf', () => {
  it('reads max lengths through default / optional / nullable wrappers', () => {
    const l = limitsOf(proposalInputSchema)
    expect(l.jobTitle).toBe(MAX.title)
    expect(l.jobUrl).toBe(2048)
    expect(l.coverLetter).toBe(50_000)
    expect(l.clientName).toBe(200)
    expect(l.proposalsOnJob).toBe(40)
    // numbers / enums have no string limit
    expect(l.bidAmount).toBeUndefined()
    expect(l.status).toBeUndefined()
  })

  it('idea title', () => {
    expect(limitsOf(ideaInputSchema).title).toBe(500)
  })

  it('synthetic schema', () => {
    const s = z.object({
      a: z.string().max(5),
      b: z.string().max(7).optional(),
      c: z.string().nullable().default(null),
      d: z.number()
    })
    expect(limitsOf(s)).toEqual({ a: 5, b: 7 })
  })
})

describe('rangesOf', () => {
  it('reads number ranges through wrappers', () => {
    const r = rangesOf(proposalInputSchema)
    expect(r.feePercent).toEqual({ min: 0, max: 100 })
    expect(r.credits).toEqual({ min: 0, max: 1000 })
    expect(r.clientRating).toEqual({ min: 0, max: 5 })
    expect(r.jobTitle).toBeUndefined()
  })

  it('withdrawal amounts', () => {
    const r = rangesOf(withdrawalInputSchema)
    expect(r.amount).toEqual({ min: 0, max: 100_000_000 })
    expect(r.rate).toEqual({ min: 0, max: 1_000_000 })
  })

  it('one-sided and unbounded numbers', () => {
    const s = z.object({ a: z.number().min(1), b: z.number().max(9), c: z.number() })
    expect(rangesOf(s)).toEqual({ a: { min: 1, max: undefined }, b: { min: undefined, max: 9 } })
  })
})

describe('isLikelyUrl', () => {
  it.each([
    '',
    'https://example.com',
    'http://example.com/path?q=1#h',
    'example.com',
    'www.google.com',
    'HTTPS://EXAMPLE.COM',
    'https://sub.example.co.uk/a',
    'https://my-site.io:8443/x',
    'http://localhost',
    'localhost:3000',
    'http://localhost:5173/#/ideas',
    'http://127.0.0.1:8080/x',
    '192.168.0.1',
    'ftp://files.example.org',
    'mailto:me@example.com',
    '  https://example.com  '
  ])('%j → true', (v) => {
    expect(isLikelyUrl(v)).toBe(true)
  })

  it.each([
    'http://lol',
    'https://example',
    'lol',
    'example.c',
    'foo bar.com',
    'https://exa mple.com',
    'javascript:alert(1)',
    'mailto:nobody',
    'http://',
    'https://example.com:abc'
  ])('%j → false', (v) => {
    expect(isLikelyUrl(v)).toBe(false)
  })

  // Regression (was a bug): the TLD may be Cyrillic ([a-zЀ-ӿ]{2,}) but the labels before it are [\w-] (ASCII only), so every
  // Cyrillic IDN domain is rejected as «не схоже на посилання» (src/renderer/src/lib/limits.ts isLikelyUrl).
  it('a Cyrillic IDN domain is a link', () => {
    expect(isLikelyUrl('https://приклад.укр')).toBe(true)
    expect(isLikelyUrl('сайт.укр')).toBe(true)
  })
})
