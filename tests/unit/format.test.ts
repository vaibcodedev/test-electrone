import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMPACT_FROM,
  countLabel,
  dayKey,
  fmtBytes,
  fmtDate,
  fmtDayFull,
  fmtDayNear,
  fmtDayShort,
  fmtDayTime,
  fmtHours,
  fmtMinutes,
  fmtMoney,
  fmtMoneyCompact,
  fmtNumber,
  fmtPercent,
  fmtRelative,
  fmtReplyTime,
  fmtTitle,
  fmtWeekRange,
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
    expect(fmtMoney(12.3, 'not-a-currency')).toBe('12,30 not-a-currency')
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
    expect(fmtHours(90)).toBe('1,5 год')
    // Under an hour: minutes, not «0 год» that reads as nothing tracked.
    expect(fmtHours(2)).toBe('2 хв')
  })
  it('fmtBytes', () => {
    expect(fmtBytes(512)).toBe('512 Б')
    expect(fmtBytes(2048)).toBe('2 КБ')
    expect(fmtBytes(5 * 1024 ** 2)).toBe('5 МБ')
    expect(fmtBytes(1.5 * 1024 ** 2)).toBe('1,5 МБ')
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
  it('snake_case identifiers keep their underscores', () => {
    expect(mdPreview('Read process_env and MAX_RETRIES')).toBe('Read process_env and MAX_RETRIES')
  })
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

describe('fmtDayFull / fmtDate', () => {
  const year = new Date().getFullYear()
  it('full month name, year only when it is not this year', () => {
    expect(fmtDayFull(new Date(year, 10, 24, 18, 0).getTime())).toBe('24 листопада')
    expect(fmtDayFull(new Date(2020, 2, 5).getTime())).toBe('5 березня 2020')
    expect(fmtDayFull(null)).toBe('')
  })
  it('fmtDate without a pattern is fmtDayFull; an explicit pattern is kept', () => {
    const ts = new Date(2020, 10, 25).getTime()
    expect(fmtDate(ts)).toBe('25 листопада 2020')
    expect(fmtDate(ts, 'yyyy')).toBe('2020')
  })
})

describe('fmtWeekRange', () => {
  it('one month: the day range and the month once', () => {
    expect(fmtWeekRange(new Date(2026, 10, 23), new Date(2026, 10, 29))).toBe('23–29 листопада')
  })
  it('two months: both months, spaced dash', () => {
    expect(fmtWeekRange(new Date(2026, 10, 30), new Date(2026, 11, 6))).toBe(
      '30 листопада – 6 грудня'
    )
  })
  it('year: added to the end date', () => {
    expect(fmtWeekRange(new Date(2026, 10, 23), new Date(2026, 10, 29), { year: true })).toBe(
      '23–29 листопада 2026'
    )
    expect(fmtWeekRange(new Date(2026, 11, 28), new Date(2027, 0, 3), { year: true })).toBe(
      '28 грудня – 3 січня 2027'
    )
  })
})

describe('fmtRelative', () => {
  it('under a minute is «щойно», not a count of seconds', () => {
    expect(fmtRelative(Date.now() - 5_000)).toBe('щойно')
    expect(fmtRelative(Date.now())).toBe('щойно')
  })
  it('from a minute on — date-fns wording', () => {
    expect(fmtRelative(Date.now() - 5 * 60_000)).toBe('5 хвилин тому')
  })
})

describe('fmtNumber', () => {
  it('groups thousands and uses a decimal comma', () => {
    expect(sp(fmtNumber(9_000_000))).toBe('9 000 000')
    expect(fmtNumber(4.9)).toBe('4,9')
    expect(fmtNumber(1.234)).toBe('1,23')
  })
})

describe('near days: fmtDayTime / fmtDayNear', () => {
  // Wednesday 25 November 2026, noon: «завтра» and the weekdays are counted from here.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('fmtDayTime: the day and «о» the time', () => {
    expect(fmtDayTime(new Date(2026, 10, 26, 15, 0).getTime())).toBe('завтра о 15:00')
    expect(fmtDayTime(new Date(2026, 10, 24, 9, 5).getTime())).toBe('учора о 09:05')
    expect(fmtDayTime(new Date(2026, 10, 2, 19, 22).getTime())).toBe('2 листопада о 19:22')
    expect(fmtDayTime(null)).toBe('')
  })
  it('fmtDayNear: the next days of the week by name, then the date', () => {
    expect(fmtDayNear(new Date(2026, 10, 25, 18).getTime())).toBe('сьогодні')
    expect(fmtDayNear(new Date(2026, 10, 26).getTime())).toBe('завтра')
    expect(fmtDayNear(new Date(2026, 10, 27).getTime())).toBe('п’ятниця')
    expect(fmtDayNear(new Date(2026, 11, 1).getTime())).toBe('вівторок')
    expect(fmtDayNear(new Date(2026, 11, 2).getTime())).toBe('2 грудня')
  })
  it('fmtDayNear: past days keep the date (a weekday would read as the coming one)', () => {
    expect(fmtDayNear(new Date(2026, 10, 24).getTime())).toBe('учора')
    expect(fmtDayNear(new Date(2026, 10, 21).getTime())).toBe('21 листопада')
  })
  it('fmtDayShort: abbreviated month, year only when it is not this year', () => {
    expect(fmtDayShort(new Date(2026, 10, 5))).toBe('5 листоп.')
    expect(fmtDayShort(new Date(2025, 11, 29).getTime())).toBe('29 груд. 2025')
  })
})

describe('fmtTitle', () => {
  it('keeps a title up to 80 characters', () => {
    expect(fmtTitle('Короткий')).toBe('Короткий')
    expect(fmtTitle('а'.repeat(80))).toBe('а'.repeat(80))
  })
  it('cuts a longer one to 80 with «…»', () => {
    const cut = fmtTitle('а'.repeat(500))
    expect(cut).toHaveLength(80)
    expect(cut.endsWith('…')).toBe(true)
  })
})
