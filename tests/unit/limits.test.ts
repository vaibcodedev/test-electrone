import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { MAX } from '@shared/domain/limits'
import { ideaInputSchema } from '@shared/domain/ideas'
import { proposalInputSchema } from '@shared/domain/freelance'
import { withdrawalInputSchema } from '@shared/domain/finance'
import type { KeyboardEvent } from 'react'
import { acceptNumberText, isLikelyUrl, limitsOf, parseNumberText, rangesOf } from '@/lib/limits'
import { clickableProps } from '@/lib/clickable'

describe('limitsOf', () => {
  it('reads max lengths through default / optional / nullable wrappers', () => {
    const l = limitsOf(proposalInputSchema)
    expect(l.jobTitle).toBe(MAX.title)
    expect(l.jobUrl).toBe(2048)
    expect(l.coverLetter).toBe(MAX.letter)
    expect(l.jobDescription).toBe(MAX.jobPost)
    expect(l.notes).toBe(MAX.note)
    expect(l.clientName).toBe(200)
    expect(l.proposalsOnJob).toBe(40)
    // numbers / enums have no string limit
    expect(l.bidAmount).toBeUndefined()
    expect(l.status).toBeUndefined()
  })

  it('idea title', () => {
    expect(limitsOf(ideaInputSchema).title).toBe(200)
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
    expect(r.clientRating).toEqual({ min: 1, max: 5, step: 0.1 })
    expect(r.credits).toEqual({ min: 0, max: 1000, integer: true })
    expect(r.jobTitle).toBeUndefined()
  })

  it('withdrawal amounts', () => {
    const r = rangesOf(withdrawalInputSchema)
    expect(r.amount).toEqual({ min: 0, max: 100_000_000 })
    expect(r.rate).toEqual({ min: 0, max: 1000 })
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

describe('acceptNumberText (typing into NumberField / NumberInput)', () => {
  it('drops leading zeros and spaces, keeps a started decimal', () => {
    expect(acceptNumberText('024', {})).toBe('24')
    expect(acceptNumberText('-007', {})).toBe('-7')
    expect(acceptNumberText('0,5', {})).toBe('0,5')
    expect(acceptNumberText('1 000', {})).toBe('1000')
  })

  it('rejects what the field can never hold', () => {
    expect(acceptNumberText('-', { min: 0 })).toBeNull()
    expect(acceptNumberText('1.2.3', {})).toBeNull()
    expect(acceptNumberText('1,5', { integer: true })).toBeNull()
    expect(acceptNumberText('12a', {})).toBeNull()
  })
})

describe('parseNumberText', () => {
  it('reads a Ukrainian number, half-typed text is no number', () => {
    expect(parseNumberText('1 234,5')).toBe(1234.5)
    expect(parseNumberText('')).toBeNull()
    expect(parseNumberText('-')).toBeNull()
  })
})

describe('clickableProps (a row acting as a button)', () => {
  const press = (key: string, nested: boolean): { activated: boolean; prevented: boolean } => {
    const onActivate = vi.fn()
    const preventDefault = vi.fn()
    const row = {}
    const event = {
      key,
      target: nested ? {} : row,
      currentTarget: row,
      preventDefault
    } as unknown as KeyboardEvent
    clickableProps(onActivate).onKeyDown(event)
    return {
      activated: onActivate.mock.calls.length > 0,
      prevented: preventDefault.mock.calls.length > 0
    }
  }

  it('Enter and Space on the row itself activate it', () => {
    expect(press('Enter', false)).toEqual({ activated: true, prevented: true })
    expect(press(' ', false)).toEqual({ activated: true, prevented: true })
    expect(press('a', false)).toEqual({ activated: false, prevented: false })
  })

  it('keys on a nested control are left to that control', () => {
    expect(press('Enter', true)).toEqual({ activated: false, prevented: false })
    expect(press(' ', true)).toEqual({ activated: false, prevented: false })
  })
})
