import { describe, expect, it } from 'vitest'
import { fieldMax, MAX } from '@shared/domain/limits'
import { isLikelyEmail } from '@shared/domain/common'
import { boardInputSchema } from '@shared/domain/boards'
import { checklistImportSchema } from '@shared/domain/checklists'
import { clientInputSchema, clientPatchSchema, projectInputSchema } from '@shared/domain/crm'
import { limitsOf, rangesOf } from '@/lib/limits'
import { amountPatch } from '@/modules/crm/money'
import { toRange, type EntryDraft } from '@/modules/crm/time-range'

const draft = (patch: Partial<EntryDraft>): EntryDraft => ({
  day: new Date(2026, 10, 20).getTime(),
  from: '',
  to: '',
  minutes: '',
  description: '',
  billable: true,
  ...patch
})
const minutes = (r: { startedAt: number; endedAt: number } | null): number | null =>
  r && (r.endedAt - r.startedAt) / 60_000

describe('time entry range', () => {
  it('a plain from–to range stays on the same day', () => {
    const r = toRange(draft({ from: '09:00', to: '10:30' }))
    expect(minutes(r)).toBe(90)
    expect(new Date(r!.endedAt).getDate()).toBe(20)
  })

  it('an end earlier than the start is on the next day (night shift)', () => {
    const r = toRange(draft({ from: '23:00', to: '01:00' }))
    expect(minutes(r)).toBe(120)
    expect(new Date(r!.startedAt).getDate()).toBe(20)
    expect(new Date(r!.endedAt).getDate()).toBe(21)
    expect(new Date(r!.endedAt).getHours()).toBe(1)
  })

  it('equal times are not a range', () => {
    expect(toRange(draft({ from: '10:00', to: '10:00' }))).toBeNull()
  })

  it('minutes on a past day end at 18:00, on today — now', () => {
    expect(new Date(toRange(draft({ minutes: '30' }))!.endedAt).getHours()).toBe(18)
    const now = new Date(2026, 10, 20, 15, 0).getTime()
    expect(toRange(draft({ minutes: '30' }), now)).toEqual({ startedAt: now - 30 * 60_000, endedAt: now })
  })
})

describe('fieldMax', () => {
  it('reads string and number bounds through default/optional wrappers', () => {
    expect(fieldMax(boardInputSchema.shape.description)).toBe(20_000)
    expect(fieldMax(projectInputSchema.shape.rate)).toBe(100_000)
    expect(fieldMax(clientInputSchema.shape.defaultRate)).toBe(100_000_000)
  })
})

describe('amountPatch (billing switch)', () => {
  it('a fixed price above the hourly ceiling does not become an invalid rate', () => {
    expect(amountPatch('hourly', 500_000)).toEqual({ rate: 0, fixedPrice: 0 })
    expect(amountPatch('hourly', 80)).toEqual({ rate: 80, fixedPrice: 0 })
    expect(amountPatch('fixed', 500_000)).toEqual({ rate: 0, fixedPrice: 500_000 })
    expect(amountPatch('none', 5)).toEqual({ rate: 0, fixedPrice: 0 })
    // whatever it returns must pass the project schema
    expect(() => projectInputSchema.parse({ title: 'x', ...amountPatch('hourly', 99_999_999) })).not.toThrow()
  })
})

describe('client email', () => {
  it('accepts empty and email-like values, rejects the rest', () => {
    expect(isLikelyEmail('')).toBe(true)
    expect(isLikelyEmail('  anna@bloom.store ')).toBe(true)
    expect(isLikelyEmail('anna@bloom')).toBe(false)
    expect(isLikelyEmail('anna bloom@x.com')).toBe(false)
    expect(clientPatchSchema.safeParse({ email: 'nope' }).success).toBe(false)
    expect(clientPatchSchema.parse({ email: ' a@b.co ' })).toEqual({ email: 'a@b.co' })
  })

  it('a patch without email never re-validates an old stored value', () => {
    expect(clientPatchSchema.safeParse({ notes: 'x' }).success).toBe(true)
  })

  it('the email length limit is still readable for the UI', () => {
    expect(limitsOf(clientInputSchema).email).toBe(320)
    expect(rangesOf(clientInputSchema).defaultRate?.max).toBe(100_000_000)
  })
})

describe('checklist import', () => {
  it('a section title longer than item.section is rejected up front', () => {
    const base = { title: 'T', sections: [{ title: 's'.repeat(MAX.name), items: ['a'] }] }
    expect(checklistImportSchema.safeParse(base).success).toBe(true)
    expect(
      checklistImportSchema.safeParse({ ...base, sections: [{ title: 's'.repeat(MAX.name + 1), items: ['a'] }] }).success
    ).toBe(false)
  })
})
