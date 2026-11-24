import { describe, expect, it } from 'vitest'
import {
  COMPACT_FROM,
  countLabel,
  dayKey,
  fmtBytes,
  fmtHours,
  fmtMinutes,
  fmtMoney,
  fmtMoneyCompact,
  fmtPercent,
  fmtReplyTime,
  hostOf,
  mdPreview,
  plural
} from '@/lib/format'

/** Intl uses NBSP (U+00A0) as group separator and before the currency; compare with plain spaces. */
const NBSP = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g')
const sp = (s: string): string => s.replace(NBSP, ' ')
const IDEA: [string, string, string] = ['ідея', 'ідеї', 'ідей']

describe('fmtMoney', () => {
  it('formats in the uk-UA locale', () => {
    expect(sp(fmtMoney(1234.5, 'USD'))).toBe('1 234,50 USD')
    expect(sp(fmtMoney(1000, 'UAH'))).toBe('1 000,00 ₴')
    expect(sp(fmtMoney(-5, 'EUR'))).toBe('-5,00 EUR')
  })
  it('rounds to 2 decimals', () => {
    expect(sp(fmtMoney(1.234, 'USD'))).toBe('1,23 USD')
  })
  it('falls back to plain text for an invalid currency code', () => {
    expect(fmtMoney(12.3, 'not-a-currency')).toBe('12.30 not-a-currency')
  })
})

describe('fmtMoneyCompact', () => {
  it('below 100 000 it is the full amount', () => {
    expect(COMPACT_FROM).toBe(100_000)
    expect(sp(fmtMoneyCompact(99_999.99, 'USD'))).toBe('99 999,99 USD')
  })
  it('from 100 000 the amount is shortened (тис. / млн / млрд)', () => {
    expect(sp(fmtMoneyCompact(100_000, 'UAH'))).toBe('100 тис. ₴')
    expect(sp(fmtMoneyCompact(250_000, 'USD'))).toBe('250 тис. USD')
    expect(sp(fmtMoneyCompact(123_456, 'USD'))).toBe('123,5 тис. USD')
    expect(sp(fmtMoneyCompact(5_900_000, 'EUR'))).toBe('5,9 млн EUR')
    expect(sp(fmtMoneyCompact(55_000_000, 'USD'))).toBe('55 млн USD')
    expect(sp(fmtMoneyCompact(1e9, 'USD'))).toBe('1 млрд USD')
  })
  it('negative big amounts are shortened too', () => {
    expect(sp(fmtMoneyCompact(-250_000, 'USD'))).toBe('-250 тис. USD')
  })
  it('rounding up to the next unit', () => {
    expect(sp(fmtMoneyCompact(999_999, 'USD'))).toBe('1 млн USD')
  })
})

describe('fmtPercent', () => {
  it('uses a decimal comma and at most one fraction digit', () => {
    expect(fmtPercent(33.333)).toBe('33,3%')
    expect(fmtPercent(50)).toBe('50%')
    expect(fmtPercent(0)).toBe('0%')
    expect(sp(fmtPercent(1234.56))).toBe('1 234,6%')
  })
})

describe('plural', () => {
  it.each([
    [0, 'ідей'],
    [1, 'ідея'],
    [2, 'ідеї'],
    [4, 'ідеї'],
    [5, 'ідей'],
    [11, 'ідей'],
    [12, 'ідей'],
    [14, 'ідей'],
    [21, 'ідея'],
    [22, 'ідеї'],
    [25, 'ідей'],
    [101, 'ідея'],
    [111, 'ідей'],
    [112, 'ідей'],
    [1001, 'ідея'],
    [-1, 'ідея'],
    [-3, 'ідеї']
  ])('%i → %s', (n, form) => {
    expect(plural(n, IDEA)).toBe(form)
  })
})

describe('countLabel', () => {
  it('exact count with the right form once everything is loaded', () => {
    expect(countLabel(1, false, IDEA)).toBe('1 ідея')
    expect(countLabel(3, false, IDEA)).toBe('3 ідеї')
    expect(countLabel(0, false, IDEA)).toBe('0 ідей')
  })
  it('«100+ ідей» while more pages remain', () => {
    expect(countLabel(100, true, IDEA)).toBe('100+ ідей')
    expect(countLabel(101, true, IDEA)).toBe('101+ ідей')
  })
})

describe('fmtReplyTime', () => {
  it.each([
    [0, 'менш ніж за годину'],
    [0.99, 'менш ніж за годину'],
    [1, 'за 1 годину'],
    [2.4, 'за 2 години'],
    [5, 'за 5 годин'],
    [21, 'за 21 годину'],
    [47, 'за 47 годин'],
    [48, 'за 2 дні'],
    [24 * 5, 'за 5 днів'],
    [24 * 21, 'за 21 день']
  ])('%d h → %s', (h, text) => {
    expect(fmtReplyTime(h)).toBe(text)
  })
})

describe('fmtMinutes / fmtHours / fmtBytes / hostOf', () => {
  it('fmtMinutes', () => {
    expect(fmtMinutes(45)).toBe('45 хв')
    expect(fmtMinutes(60)).toBe('1 год')
    expect(fmtMinutes(135)).toBe('2 год 15 хв')
  })
  it('fmtHours', () => {
    expect(fmtHours(120)).toBe('2 год')
    expect(fmtHours(90)).toBe('1.5 год')
  })
  it('fmtBytes', () => {
    expect(fmtBytes(512)).toBe('512 Б')
    expect(fmtBytes(2048)).toBe('2 КБ')
    expect(fmtBytes(5 * 1024 ** 2)).toBe('5.0 МБ')
  })
  it('hostOf strips www and keeps junk as is', () => {
    expect(hostOf('https://www.example.com/a?b')).toBe('example.com')
    expect(hostOf('not a url')).toBe('not a url')
  })
})

describe('mdPreview', () => {
  it('strips headings, lists, emphasis, links, images and code fences', () => {
    const md =
      '# Title\n\n- item **bold** and _it_\n1. [link](https://x.y) ![img](a.png)\n\n```js\nconst a = 1\n```\n> quote `code`'
    expect(mdPreview(md)).toBe('Title item bold and it link quote code')
  })
  it('collapses whitespace', () => {
    expect(mdPreview('  a \n\n  b  ')).toBe('a b')
  })
  // Regression (was a bug): `_` is stripped everywhere, not only as emphasis: identifiers lose their underscores in previews
  // (src/renderer/src/lib/format.ts mdPreview, `.replace(/(\*\*|__|\*|_|~~|`)/g, '')`).
  it('snake_case identifiers keep their underscores',
    () => {
      expect(mdPreview('Read process_env and MAX_RETRIES')).toBe('Read process_env and MAX_RETRIES')
    }
  )
  // Regression (was a bug): same regex removes a lone `*` (multiplication) — «2 * 3» → «2 3».
  it('a lone asterisk in text survives', () => {
    expect(mdPreview('2 * 3 = 6')).toBe('2 * 3 = 6')
  })
})

describe('dayKey', () => {
  it('is the local day, zero-padded, and parses back to local midnight', () => {
    const at = new Date(2026, 0, 5, 23, 59).getTime()
    expect(dayKey(at)).toBe('2026-01-05')
    expect(dayKey(new Date(2026, 10, 25))).toBe('2026-11-25')
    expect(new Date(dayKey(at) + 'T00:00').getTime()).toBe(new Date(2026, 0, 5).getTime())
  })
})
