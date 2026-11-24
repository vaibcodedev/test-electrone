process.env.TZ = 'Europe/Kyiv'

import { describe, expect, it } from 'vitest'
import { occurrences } from '@main/modules/calendar'
import { addDays, dayKey, endOfDay, startOfDay } from '@main/core/util'

const H = 3600_000
const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime()
const keys = (ts: number[]): string[] => ts.map(dayKey)
type Rec = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
type Ev = { startAt: number; endAt: number | null; recurrence: Rec }
const ev = (startAt: number, recurrence: Rec, endAt: number | null = null): Ev => ({
  startAt,
  endAt,
  recurrence
})

describe('occurrences: none', () => {
  it('inside the range → one occurrence', () => {
    const s = at(2026, 5, 10, 10)
    expect(occurrences(ev(s, 'none'), at(2026, 5, 1), at(2026, 5, 31))).toEqual([s])
  })

  it('outside the range → nothing', () => {
    const s = at(2026, 4, 10, 10)
    expect(occurrences(ev(s, 'none'), at(2026, 5, 1), at(2026, 5, 31))).toEqual([])
    expect(
      occurrences(ev(at(2026, 6, 1, 10), 'none'), at(2026, 5, 1), endOfDay(at(2026, 5, 31)))
    ).toEqual([])
  })

  it('range edges are inclusive (start === to, end === from)', () => {
    const s = at(2026, 5, 10, 10)
    expect(occurrences(ev(s, 'none'), at(2026, 5, 1), s)).toEqual([s])
    expect(occurrences(ev(s, 'none', s + H), s + H, at(2026, 5, 31))).toEqual([s])
    expect(occurrences(ev(s, 'none', s + H), s + H + 1, at(2026, 5, 31))).toEqual([])
  })

  it('a long event that started before the range and is still running overlaps it', () => {
    const s = at(2026, 4, 28, 9)
    const e = at(2026, 5, 3, 18)
    expect(occurrences(ev(s, 'none', e), at(2026, 5, 1), at(2026, 5, 31))).toEqual([s])
  })
})

describe('occurrences: daily', () => {
  it('one per day inside the range', () => {
    const s = at(2026, 1, 1, 9)
    const from = at(2026, 5, 1)
    const to = endOfDay(at(2026, 5, 7))
    const out = occurrences(ev(s, 'daily'), from, to)
    expect(keys(out)).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07'
    ])
    expect(out.every((t) => new Date(t).getHours() === 9)).toBe(true)
  })

  it('keeps 09:00 local time across the autumn DST switch', () => {
    const s = at(2026, 10, 20, 9)
    const out = occurrences(ev(s, 'daily'), at(2026, 10, 24), endOfDay(at(2026, 10, 27)))
    expect(keys(out)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'])
    expect(out.map((t) => new Date(t).getHours())).toEqual([9, 9, 9, 9])
  })

  it('keeps 00:30 local time across the spring DST switch (no lost or duplicated day)', () => {
    const s = at(2026, 3, 1, 0, 30)
    const out = occurrences(ev(s, 'daily'), at(2026, 3, 28), endOfDay(at(2026, 3, 31)))
    expect(keys(out)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31'])
  })

  it('a multi-day daily occurrence that started before `from` is included', () => {
    // Each occurrence lasts 2 days: the one from 30 Apr still runs on 1 May.
    const s = at(2026, 4, 1, 12)
    const out = occurrences(ev(s, 'daily', s + 48 * H), at(2026, 5, 1, 13), at(2026, 5, 1, 14))
    expect(keys(out)).toEqual(['2026-04-30', '2026-05-01'])
  })

  it('jumps close to `from` for old events (does not stop at the 1000-iteration cap)', () => {
    const s = at(2020, 1, 1, 9)
    const out = occurrences(ev(s, 'daily'), at(2026, 11, 24), endOfDay(at(2026, 11, 24)))
    expect(keys(out)).toEqual(['2026-11-24'])
  })

  it('nothing before the event starts', () => {
    const s = at(2026, 6, 1, 9)
    expect(occurrences(ev(s, 'daily'), at(2026, 5, 1), endOfDay(at(2026, 5, 31)))).toEqual([])
  })
})

describe('occurrences: weekly', () => {
  it('same weekday every week', () => {
    const s = at(2026, 1, 5, 10) // Monday
    const out = occurrences(ev(s, 'weekly'), at(2026, 6, 1), endOfDay(at(2026, 6, 30)))
    expect(keys(out)).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
      '2026-06-29'
    ])
    expect(out.every((t) => new Date(t).getDay() === 1 && new Date(t).getHours() === 10)).toBe(true)
  })

  it('crosses DST without drifting an hour', () => {
    const s = at(2026, 10, 18, 10) // Sunday before the switch
    const out = occurrences(ev(s, 'weekly'), at(2026, 10, 18), endOfDay(at(2026, 11, 1)))
    expect(out.map((t) => new Date(t).getHours())).toEqual([10, 10, 10])
    expect(keys(out)).toEqual(['2026-10-18', '2026-10-25', '2026-11-01'])
  })
})

describe('occurrences: monthly', () => {
  it('the 31st clamps to the last day of short months and comes back to 31', () => {
    const s = at(2026, 1, 31, 12)
    const out = occurrences(ev(s, 'monthly'), at(2026, 1, 1), endOfDay(at(2026, 5, 31)))
    expect(keys(out)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31'
    ])
  })

  it('leap year: 31 Jan → 29 Feb 2028', () => {
    const s = at(2028, 1, 31, 12)
    const out = occurrences(ev(s, 'monthly'), at(2028, 2, 1), endOfDay(at(2028, 2, 29)))
    expect(keys(out)).toEqual(['2028-02-29'])
  })

  it('the 15th stays the 15th across a year boundary', () => {
    const s = at(2026, 11, 15, 8)
    const out = occurrences(ev(s, 'monthly'), at(2026, 12, 1), endOfDay(at(2027, 2, 28)))
    expect(keys(out)).toEqual(['2026-12-15', '2027-01-15', '2027-02-15'])
  })
})

describe('occurrences: yearly', () => {
  it('29 Feb → 28 Feb in non-leap years, 29 Feb again in a leap year', () => {
    const s = at(2028, 2, 29, 10)
    const out = occurrences(ev(s, 'yearly'), at(2028, 1, 1), endOfDay(at(2032, 12, 31)))
    expect(keys(out)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29'
    ])
  })

  it('birthday: one per year inside a month range', () => {
    const s = at(1990, 7, 14, 0)
    const out = occurrences(ev(s, 'yearly'), at(2026, 7, 1), endOfDay(at(2026, 7, 31)))
    expect(keys(out)).toEqual(['2026-07-14'])
  })
})

describe('occurrences: month grid range', () => {
  it('a daily event over a 6-week calendar grid gives 42 days', () => {
    const from = startOfDay(at(2026, 9, 28))
    const to = endOfDay(addDays(from, 41))
    const out = occurrences(ev(at(2026, 1, 1, 7), 'daily'), from, to)
    expect(out).toHaveLength(42)
    expect(new Set(keys(out)).size).toBe(42)
  })
})
