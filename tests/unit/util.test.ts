// Calendar arithmetic is asserted in Kyiv time: DST starts 2026-03-29 (23 h) and ends 2026-10-25 (25 h).
process.env.TZ = 'Europe/Kyiv'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fmtWhen } from '@shared/dates'
import {
  DAY_MS,
  addDays,
  dayKey,
  endOfDay,
  excerpt,
  likePattern,
  localDayNumber,
  overlapMinutes,
  slugify,
  startOfDay,
  startOfMonth,
  startOfWeek,
  retryBusy,
  toFtsQuery
} from '@main/core/util'

const H = 3600_000
const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime()

describe('timezone sanity', () => {
  it('runs in Europe/Kyiv (UTC+2 in winter, UTC+3 in summer)', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-120)
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(-180)
  })
})

describe('startOfDay / endOfDay', () => {
  it('returns local midnight', () => {
    const d = new Date(startOfDay(at(2026, 5, 10, 17, 45)))
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([
      0, 0, 0, 0
    ])
    expect(d.getDate()).toBe(10)
  })

  it('autumn DST day (2026-10-25) is 25 hours long', () => {
    const s = startOfDay(at(2026, 10, 25, 12))
    expect(endOfDay(s) + 1 - s).toBe(25 * H)
  })

  it('spring DST day (2026-03-29) is 23 hours long', () => {
    const s = startOfDay(at(2026, 3, 29, 12))
    expect(endOfDay(s) + 1 - s).toBe(23 * H)
  })

  it('an ordinary day is 24 hours long', () => {
    const s = startOfDay(at(2026, 6, 1, 9))
    expect(endOfDay(s) - s + 1).toBe(DAY_MS)
  })

  it('endOfDay is the last millisecond of the same local date', () => {
    const e = endOfDay(at(2026, 10, 25, 3))
    expect(dayKey(e)).toBe('2026-10-25')
    expect(dayKey(e + 1)).toBe('2026-10-26')
  })
})

describe('addDays', () => {
  it('keeps wall-clock time across the autumn DST switch', () => {
    const t = addDays(at(2026, 10, 24, 18), 1)
    expect(new Date(t).getHours()).toBe(18)
    expect(dayKey(t)).toBe('2026-10-25')
    expect(t - at(2026, 10, 24, 18)).toBe(25 * H)
  })

  it('keeps wall-clock time across the spring DST switch', () => {
    const t = addDays(at(2026, 3, 28, 9), 2)
    expect(new Date(t).getHours()).toBe(9)
    expect(dayKey(t)).toBe('2026-03-30')
  })

  it('goes backwards and across months / years', () => {
    expect(dayKey(addDays(at(2026, 3, 1, 12), -1))).toBe('2026-02-28')
    expect(dayKey(addDays(at(2028, 3, 1, 12), -1))).toBe('2028-02-29')
    expect(dayKey(addDays(at(2026, 12, 31, 12), 1))).toBe('2027-01-01')
  })
})

describe('startOfWeek', () => {
  it('Monday is the first day of the week', () => {
    // 2026-11-24 is a Tuesday.
    expect(dayKey(startOfWeek(at(2026, 11, 24, 15)))).toBe('2026-11-23')
    expect(new Date(startOfWeek(at(2026, 11, 24, 15))).getHours()).toBe(0)
  })

  it('Sunday belongs to the week that started the previous Monday', () => {
    expect(dayKey(startOfWeek(at(2026, 11, 29, 23, 59)))).toBe('2026-11-23')
  })

  it('Monday 00:00 is its own week start', () => {
    const mon = at(2026, 11, 23)
    expect(startOfWeek(mon)).toBe(mon)
  })

  it('the DST week is 7 calendar days (169 h) long', () => {
    // 2026-10-25 (Sunday) belongs to the week of Monday 2026-10-19.
    const w = startOfWeek(at(2026, 10, 25, 12))
    expect(dayKey(w)).toBe('2026-10-19')
    expect(addDays(w, 7) - w).toBe(7 * 24 * H + H)
  })
})

describe('dayKey / localDayNumber', () => {
  it('dayKey uses the local date, not UTC (01:30 Kyiv is still the previous day in UTC)', () => {
    const t = at(2026, 6, 1, 1, 30)
    expect(new Date(t).toISOString().slice(0, 10)).toBe('2026-05-31')
    expect(dayKey(t)).toBe('2026-06-01')
  })

  it('localDayNumber changes exactly at local midnight', () => {
    const mid = at(2026, 6, 1)
    expect(localDayNumber(mid) - localDayNumber(mid - 1)).toBe(1)
    expect(localDayNumber(mid)).toBe(localDayNumber(mid + DAY_MS - 1))
  })

  it('localDayNumber counts one per calendar day across DST', () => {
    expect(localDayNumber(at(2026, 10, 26, 0, 30)) - localDayNumber(at(2026, 10, 25, 0, 30))).toBe(
      1
    )
    expect(localDayNumber(at(2026, 10, 25, 23, 59)) - localDayNumber(at(2026, 10, 25, 0, 0))).toBe(
      0
    )
    expect(localDayNumber(at(2026, 3, 30)) - localDayNumber(at(2026, 3, 29))).toBe(1)
  })

  it('localDayNumber(1970-01-01 local) is 0', () => {
    expect(localDayNumber(at(1970, 1, 1, 12))).toBe(0)
  })

  it('startOfMonth', () => {
    expect(dayKey(startOfMonth(at(2026, 10, 25, 12)))).toBe('2026-10-01')
  })
})

describe('overlapMinutes', () => {
  const from = at(2026, 6, 1)
  const to = endOfDay(from)

  it('entry fully inside the range counts all its minutes', () => {
    const e = { startedAt: at(2026, 6, 1, 10), endedAt: at(2026, 6, 1, 12), minutes: 120 }
    expect(overlapMinutes(e, from, to, Date.now())).toBe(120)
  })

  it('entry crossing midnight counts only its own part', () => {
    const e = { startedAt: at(2026, 6, 1, 23), endedAt: at(2026, 6, 2, 1), minutes: 120 }
    expect(overlapMinutes(e, from, to, Date.now())).toBe(60)
    expect(overlapMinutes(e, at(2026, 6, 2), endOfDay(at(2026, 6, 2)), Date.now())).toBe(60)
  })

  it('manual minutes that differ from the clock span are scaled proportionally', () => {
    // 2 h span logged as 60 min, half of it in range → 30 min.
    const e = { startedAt: at(2026, 6, 1, 23), endedAt: at(2026, 6, 2, 1), minutes: 60 }
    expect(overlapMinutes(e, from, to, Date.now())).toBe(30)
  })

  it('entry outside the range counts 0', () => {
    const e = { startedAt: at(2026, 6, 3, 10), endedAt: at(2026, 6, 3, 11), minutes: 60 }
    expect(overlapMinutes(e, from, to, Date.now())).toBe(0)
  })

  it('running entry (endedAt null) counts up to `at`', () => {
    const e = { startedAt: at(2026, 6, 1, 10), endedAt: null, minutes: 0 }
    expect(overlapMinutes(e, from, to, at(2026, 6, 1, 10, 45))).toBe(45)
  })

  it('zero-length manual entry counts when it starts inside the range', () => {
    const e = { startedAt: at(2026, 6, 1, 10), endedAt: at(2026, 6, 1, 10), minutes: 90 }
    expect(overlapMinutes(e, from, to, Date.now())).toBe(90)
    expect(overlapMinutes(e, at(2026, 6, 2), endOfDay(at(2026, 6, 2)), Date.now())).toBe(0)
  })
})

describe('likePattern', () => {
  it('wraps in % and escapes LIKE wildcards and the escape char', () => {
    expect(likePattern('abc')).toBe('%abc%')
    expect(likePattern('50%_off')).toBe('%50\\%\\_off%')
    expect(likePattern('a\\b')).toBe('%a\\\\b%')
  })

  it('keeps Cyrillic as is', () => {
    expect(likePattern('Здача')).toBe('%Здача%')
  })
})

describe('toFtsQuery', () => {
  it('quotes every token as a prefix term', () => {
    expect(toFtsQuery('react hooks')).toBe('"react"* "hooks"*')
  })
  it('drops punctuation (no FTS syntax injection) and returns null for nothing', () => {
    expect(toFtsQuery('foo" OR bar*')).toBe('"foo"* "OR"* "bar"*')
    expect(toFtsQuery('  -- ** ')).toBeNull()
  })
  it('handles Cyrillic', () => {
    expect(toFtsQuery('здача роботи')).toBe('"здача"* "роботи"*')
  })
})

describe('slugify / excerpt', () => {
  it('slugify keeps letters of any script and falls back', () => {
    expect(slugify('Hello, World!')).toBe('hello-world')
    expect(slugify('!!!')).toBe('item')
  })
  it('excerpt strips markdown and truncates', () => {
    expect(excerpt('# Title\n\n**bold** [link](http://x.y)')).toBe('Title bold link')
    expect(excerpt('a'.repeat(100), 10)).toBe('a'.repeat(9) + '…')
    expect(excerpt('```js\ncode\n```')).toBeUndefined()
  })
})

describe('fmtWhen (notification text)', () => {
  afterEach(() => vi.useRealTimers())
  const today = at(2026, 11, 25, 9)

  it('today and tomorrow are words, a later day is a date', () => {
    vi.useFakeTimers({ now: today, toFake: ['Date'] })
    expect(fmtWhen(at(2026, 11, 25, 15), false)).toBe('Сьогодні о 15:00')
    expect(fmtWhen(at(2026, 11, 26, 15), false)).toBe('Завтра о 15:00')
    expect(fmtWhen(at(2026, 11, 28, 9, 5), false)).toBe('28 листопада о 09:05')
  })

  it('an all-day event gets the day only; another year is written out', () => {
    vi.useFakeTimers({ now: today, toFake: ['Date'] })
    expect(fmtWhen(at(2026, 11, 25), true)).toBe('Сьогодні')
    expect(fmtWhen(at(2026, 11, 26), true)).toBe('Завтра')
    expect(fmtWhen(at(2027, 1, 3), true)).toBe('3 січня 2027')
  })
})

describe('retryBusy', () => {
  const busy = (): never => {
    throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' })
  }

  it('tries again while the file is busy, then gives up with the error', () => {
    let calls = 0
    expect(retryBusy(() => (++calls < 3 ? busy() : 'ok'), 5, 1)).toBe('ok')
    expect(calls).toBe(3)
    calls = 0
    expect(() => retryBusy(() => (calls++, busy()), 2, 1)).toThrow('EBUSY')
    expect(calls).toBe(2)
  })

  it('any other error is not retried', () => {
    let calls = 0
    expect(() =>
      retryBusy(() => {
        calls++
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      })
    ).toThrow('ENOENT')
    expect(calls).toBe(1)
  })
})
