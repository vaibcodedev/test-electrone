process.env.TZ = 'Europe/Kyiv'

/** Repeating cards, the pure part: the next deadline and the rule an edit saves. */
import { describe, expect, it } from 'vitest'
import { nextRepeatDue, normalizeRepeat, repeatAfterEdit } from '@main/modules/card-repeat'
import { dayKey } from '@main/core/util'

const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime()
const hm = (ts: number): string => `${new Date(ts).getHours()}:${new Date(ts).getMinutes()}`

describe('nextRepeatDue', () => {
  it('daily: the next day, keeping the time', () => {
    const due = at(2026, 11, 26, 9, 30)
    const next = nextRepeatDue({ freq: 'daily' }, due, at(2026, 11, 26, 8))
    expect(dayKey(next)).toBe('2026-11-27')
    expect(hm(next)).toBe('9:30')
  })

  it('missed periods are skipped: a daily card due a week ago, done today → tomorrow', () => {
    const next = nextRepeatDue({ freq: 'daily' }, at(2026, 11, 19, 18), at(2026, 11, 26, 12))
    expect(dayKey(next)).toBe('2026-11-27')
    expect(hm(next)).toBe('18:0')
  })

  it('done early: the next one comes after the old deadline, not after today', () => {
    const next = nextRepeatDue({ freq: 'daily' }, at(2026, 11, 30, 10), at(2026, 11, 26, 12))
    expect(dayKey(next)).toBe('2026-12-01')
  })

  it('without a deadline: counts from today, all day (00:00)', () => {
    const next = nextRepeatDue({ freq: 'daily' }, null, at(2026, 11, 26, 15, 45))
    expect(dayKey(next)).toBe('2026-11-27')
    expect(hm(next)).toBe('0:0')
  })

  it('weekly on chosen days: the next chosen weekday', () => {
    // 26.11.2026 is a Thursday (4). Mon + Thu → Monday 30.11.
    const rule = { freq: 'weekly' as const, days: [1, 4] }
    expect(dayKey(nextRepeatDue(rule, at(2026, 11, 26, 10), at(2026, 11, 26, 9)))).toBe(
      '2026-11-30'
    )
    // Due Monday 23.11, done Wednesday 25.11 → Thursday 26.11.
    expect(dayKey(nextRepeatDue(rule, at(2026, 11, 23, 10), at(2026, 11, 25, 9)))).toBe(
      '2026-11-26'
    )
  })

  it('monthly on the 31st: clamps to short months and comes back to 31 (no drift)', () => {
    const rule = { freq: 'monthly' as const, day: 31 }
    const feb = nextRepeatDue(rule, at(2026, 1, 31, 9), at(2026, 1, 31, 8))
    expect(dayKey(feb)).toBe('2026-02-28')
    const mar = nextRepeatDue(rule, feb, at(2026, 2, 28, 8))
    expect(dayKey(mar)).toBe('2026-03-31')
    const apr = nextRepeatDue(rule, mar, at(2026, 3, 31, 8))
    expect(dayKey(apr)).toBe('2026-04-30')
    expect(hm(apr)).toBe('9:0')
  })

  it('monthly on the 29th in a leap year: 29 лютого', () => {
    expect(
      dayKey(nextRepeatDue({ freq: 'monthly', day: 29 }, at(2028, 1, 29), at(2028, 1, 29)))
    ).toBe('2028-02-29')
  })

  it('keeps the wall-clock time across the autumn DST switch', () => {
    // Kyiv goes back an hour on 25.10.2026.
    const next = nextRepeatDue({ freq: 'daily' }, at(2026, 10, 24, 9), at(2026, 10, 24, 8))
    expect(dayKey(next)).toBe('2026-10-25')
    expect(hm(next)).toBe('9:0')
  })
})

describe('the rule an edit saves', () => {
  const now = at(2026, 11, 26, 12)

  it('monthly takes the deadline’s day, or today’s without one', () => {
    expect(normalizeRepeat({ freq: 'monthly' }, at(2026, 12, 31), now)).toEqual({
      freq: 'monthly',
      day: 31
    })
    expect(normalizeRepeat({ freq: 'monthly' }, null, now)).toEqual({ freq: 'monthly', day: 26 })
  })

  it('weekdays are sorted, without repeats', () => {
    expect(normalizeRepeat({ freq: 'weekly', days: [5, 1, 5] }, null, now)).toEqual({
      freq: 'weekly',
      days: [1, 5]
    })
  })

  it('«31-го» survives a card due 28 лютого when only its time changes', () => {
    const current = { repeat: { freq: 'monthly' as const, day: 31 }, dueAt: at(2027, 2, 28, 9) }
    expect(repeatAfterEdit(current, { dueAt: at(2027, 2, 28, 15) }, now)).toEqual({
      freq: 'monthly',
      day: 31
    })
  })

  it('moving the deadline to another day resets the day of the month', () => {
    const current = { repeat: { freq: 'monthly' as const, day: 31 }, dueAt: at(2027, 2, 28, 9) }
    expect(repeatAfterEdit(current, { dueAt: at(2027, 3, 5, 9) }, now)).toEqual({
      freq: 'monthly',
      day: 5
    })
  })

  it('clearing the deadline keeps the day; switching to monthly picks the deadline’s', () => {
    const current = { repeat: { freq: 'monthly' as const, day: 31 }, dueAt: at(2027, 2, 28, 9) }
    expect(repeatAfterEdit(current, { dueAt: null }, now)).toEqual({ freq: 'monthly', day: 31 })
    expect(
      repeatAfterEdit(
        { repeat: { freq: 'daily' }, dueAt: at(2026, 12, 30) },
        { repeat: { freq: 'monthly' } },
        now
      )
    ).toEqual({ freq: 'monthly', day: 30 })
  })
})
