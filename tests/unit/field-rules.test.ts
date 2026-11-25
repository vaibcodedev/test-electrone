/**
 * Field limits and number rules (docs/design-system.md → Ліміти полів): realistic text tiers, number fields that
 * refuse impossible keys, and stored data from before the limits that still opens and saves its other fields.
 */
import { describe, expect, it } from 'vitest'
import { MAX } from '@shared/domain/limits'
import { configureZod, describeZodError } from '@shared/zod-locale'
import { isLikelyPhone } from '@shared/domain/common'
import {
  PROPOSAL_COUNTS,
  proposalCountOf,
  proposalInputSchema,
  proposalPatchSchema,
  templateInputSchema
} from '@shared/domain/freelance'
import { clientInputSchema, clientPatchSchema, projectInputSchema } from '@shared/domain/crm'
import {
  companyPatchSchema,
  companySizeOf,
  applicationInputSchema,
  applicationPatchSchema,
  questionInputSchema
} from '@shared/domain/jobs'
import { noteInputSchema } from '@shared/domain/notes'
import { snippetInputSchema } from '@shared/domain/snippets'
import { ideaInputSchema } from '@shared/domain/ideas'
import { IMPORT_DEFS } from '@shared/domain/import'
import {
  acceptNumberText,
  decimalsIn,
  decimalsOf,
  limitsOf,
  overLimitText,
  precisionOf,
  precisionText,
  rangesOf,
  type NumberRules
} from '@/lib/limits'

configureZod()

/** uk-UA groups digits with a no-break space. */
const sp = (s: string): string => s.replace(/\s/g, ' ')

/** Key by key, as a person types: a refused key leaves the text as it was. */
const typeKeys = (keys: string, rules: NumberRules): string => {
  let text = ''
  for (const key of keys) {
    const next = acceptNumberText(text + key, { ...rules, typing: true })
    if (next !== null) text = next
  }
  return text
}

const R = rangesOf(proposalInputSchema)
const rating: NumberRules = { ...R.clientRating, precision: precisionOf(R.clientRating ?? {}) }
const hire: NumberRules = { ...R.clientHireRate, precision: precisionOf(R.clientHireRate ?? {}) }
const spent: NumberRules = { ...R.clientSpent, precision: precisionOf(R.clientSpent ?? {}) }

describe('text limits by purpose', () => {
  it('the fields the user hit are no longer 50–100 thousand', () => {
    const p = limitsOf(proposalInputSchema)
    expect(p.jobDescription).toBe(MAX.jobPost)
    expect(p.coverLetter).toBe(MAX.letter)
    expect(p.notes).toBe(MAX.note)
    expect(MAX.letter).toBe(5_000) // Upwork's own cover letter limit
    const a = limitsOf(applicationInputSchema)
    expect(a.description).toBe(20_000)
    expect(a.coverLetter).toBe(5_000)
    expect(a.notes).toBe(5_000)
  })

  it('a copy is never smaller than its source (proposal → template, proposal → contract)', () => {
    expect(limitsOf(templateInputSchema).body).toBe(limitsOf(proposalInputSchema).coverLetter)
    expect(limitsOf(projectInputSchema).description).toBe(
      limitsOf(proposalInputSchema).jobDescription
    )
  })

  it('long knowledge texts keep a deliberate, larger tier', () => {
    expect(limitsOf(noteInputSchema).body).toBe(50_000)
    expect(limitsOf(snippetInputSchema).code).toBe(50_000)
    expect(limitsOf(ideaInputSchema).body).toBe(20_000)
    expect(limitsOf(questionInputSchema).answer).toBe(20_000)
  })

  it('no text field of any schema is above MAX.document (except transport and secrets)', () => {
    for (const schema of [
      proposalInputSchema,
      clientInputSchema,
      applicationInputSchema,
      noteInputSchema
    ]) {
      for (const max of Object.values(limitsOf(schema)))
        expect(max).toBeLessThanOrEqual(MAX.document)
    }
  })
})

describe('stored text longer than a lowered limit', () => {
  const old = 'x'.repeat(60_000) // a cover letter saved when the limit was 50 000+

  it('a patch of another field of that record passes (only sent fields are validated)', () => {
    expect(proposalPatchSchema.safeParse({ jobTitle: 'Нова назва' }).success).toBe(true)
    expect(proposalPatchSchema.safeParse({ status: 'replied', clientRating: 4.9 }).success).toBe(
      true
    )
    expect(applicationPatchSchema.safeParse({ status: 'interview' }).success).toBe(true)
  })

  it('the long text itself must be shortened before it saves, with a clear message', () => {
    const r = proposalPatchSchema.safeParse({ coverLetter: old })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(sp(describeZodError(r.error))).toBe(
        'Супровідний лист: занадто довго — максимум 5 000 символів'
      )
    expect(proposalPatchSchema.safeParse({ coverLetter: old.slice(0, 5_000) }).success).toBe(true)
  })

  it('the field explains it under itself, without cutting anything', () => {
    expect(sp(overLimitText(60_000, 5_000))).toBe(
      'Текст задовгий: 60 000 із 5 000 символів. Скоротіть його, щоб зберегти зміни'
    )
  })

  it('an import with a longer text names the record and the field', () => {
    const items = [{ title: 'Ок' }, { title: 'Задовга', body: 'x'.repeat(MAX.letter + 1) }]
    const r = IMPORT_DEFS.template.schema.safeParse(items)
    expect(r.success).toBe(false)
    if (!r.success)
      expect(sp(describeZodError(r.error))).toBe(
        'Запис 2 → Текст: занадто довго — максимум 5 000 символів'
      )
  })
})

describe('client rating: 1–5, one decimal (the user’s table)', () => {
  it.each(['1', '2.5', '2,5', '3.8', '3,8', '4,9', '5'])('typing %s is accepted', (keys) => {
    expect(typeKeys(keys, rating)).toBe(keys)
  })

  it.each([
    ['5.1', '5.'], // past 5
    ['5,1', '5,'],
    ['4.99', '4.9'], // a second decimal
    ['0.9', ''], // «0» and «.» can never reach 1, «9» is past 5
    ['-1', '1'], // no minus
    ['abc', ''], // no letters
    ['4,5ы', '4,5'],
    ['42222', '4'] // never more digits than 5 has
  ])('typing %s stops at %j', (keys, kept) => {
    expect(typeKeys(keys, rating)).toBe(kept)
  })

  it('the server takes the same values and refuses the rest', () => {
    for (const v of [1, 2.5, 3.8, 4.9, 5])
      expect(proposalPatchSchema.safeParse({ clientRating: v }).success).toBe(true)
    for (const v of [5.1, 0.9, 4.99, -1, 0])
      expect(proposalPatchSchema.safeParse({ clientRating: v }).success).toBe(false)
    expect(proposalPatchSchema.safeParse({ clientRating: null }).success).toBe(true)
  })

  it('a too precise value is explained in decimals', () => {
    const r = clientPatchSchema.safeParse({ rating: 4.99 })
    expect(r.success).toBe(false)
    if (!r.success)
      expect(describeZodError(r.error)).toBe('Рейтинг: не більше одного знака після коми')
    expect(precisionText(1)).toBe('Не більше одного знака після коми')
    expect(precisionText(0)).toBe('Тільки ціле число')
  })

  it('rangesOf hands the step to the field', () => {
    expect(R.clientRating).toEqual({ min: 1, max: 5, step: 0.1 })
    expect(precisionOf(R.clientRating ?? {})).toBe(1)
  })
})

describe('hire rate and spent', () => {
  it('«Найм» is a whole percent 0–100', () => {
    expect(R.clientHireRate).toEqual({ min: 0, max: 100, integer: true })
    expect(typeKeys('424242424', hire)).toBe('42')
    expect(typeKeys('100', hire)).toBe('100')
    expect(typeKeys('7,5', hire)).toBe('75')
  })

  it('«Витрачено»: 24 digits stop at what fits 100 000 000', () => {
    expect(R.clientSpent).toEqual({ min: 0, max: 100_000_000, integer: true })
    expect(typeKeys('424242424242424242424242', spent)).toBe('42424242')
    expect(typeKeys('100000000', spent)).toBe('100000000')
    expect(typeKeys('999999999', spent)).toBe('99999999')
  })
})

describe('acceptNumberText', () => {
  it('drops leading zeros and spaces, keeps a started decimal', () => {
    expect(acceptNumberText('024', {})).toBe('24')
    expect(acceptNumberText('-007', {})).toBe('-7')
    expect(acceptNumberText('0,5', {})).toBe('0,5')
    expect(acceptNumberText('1 000', {})).toBe('1000')
  })

  it('money takes two decimals with a comma or a dot', () => {
    const money: NumberRules = { min: 0, max: 100_000_000, precision: precisionOf({}) }
    expect(typeKeys('12,345', money)).toBe('12,34')
    expect(typeKeys('12.345', money)).toBe('12.34')
  })

  it('a negative range (Connects adjust) takes a minus, within its bound', () => {
    const adjust: NumberRules = { min: -100_000, max: 100_000, integer: true }
    expect(typeKeys('-1000000', adjust)).toBe('-100000')
  })

  it('pasted or shortened text passes the range check and is explained under the field', () => {
    expect(acceptNumberText('5,1', { ...rating, typing: false })).toBe('5,1')
    expect(acceptNumberText('4,99', { ...rating, typing: false })).toBe('4,99')
    // A stored 33,3 in a whole-number field can still be shortened.
    expect(acceptNumberText('33,', { ...hire, typing: false })).toBe('33,')
    // Letters and a minus where min ≥ 0 are never taken.
    expect(acceptNumberText('4a', { ...rating, typing: false })).toBeNull()
    expect(acceptNumberText('-4', { ...rating, typing: false })).toBeNull()
  })

  it('decimals of a step and of a typed text', () => {
    expect(decimalsOf(0.1)).toBe(1)
    expect(decimalsOf(0.25)).toBe(2)
    expect(decimalsOf(0.0001)).toBe(4)
    expect(decimalsOf(1)).toBe(0)
    expect(decimalsIn('4,99')).toBe(2)
    expect(decimalsIn('12')).toBe(0)
    expect(precisionOf({ integer: true, step: 0.1 })).toBe(0)
    expect(precisionOf({ step: 0.5 })).toBe(1)
  })
})

describe('«Відгуків на вакансію» is a choice', () => {
  it('only Upwork buckets (or empty) save', () => {
    for (const v of [...PROPOSAL_COUNTS, ''])
      expect(proposalPatchSchema.safeParse({ proposalsOnJob: v }).success).toBe(true)
    expect(proposalPatchSchema.safeParse({ proposalsOnJob: '4242ыаыа' }).success).toBe(false)
  })

  it('an old free text maps to its bucket, or stays as it was written', () => {
    expect(proposalCountOf('20 to 50')).toBe('20–50')
    expect(proposalCountOf('20-50')).toBe('20–50')
    expect(proposalCountOf('Less than 5')).toBe('<5')
    expect(proposalCountOf('менше 5')).toBe('<5')
    expect(proposalCountOf('50+')).toBe('50+')
    expect(proposalCountOf('4242ыаыа')).toBeNull()
    expect(proposalCountOf('20–40')).toBeNull()
    expect(proposalCountOf('')).toBeNull()
  })
})

describe('phone', () => {
  it.each(['', '+380 67 123 45 67', '(555) 123-4567', '+1.555.123.4567', '0671234567'])(
    '%j is a phone',
    (v) => {
      expect(isLikelyPhone(v)).toBe(true)
    }
  )

  it.each(['телефон', '12345', '@username', '+380 67 123 45 67 ext 12', '1'.repeat(16)])(
    '%j is not',
    (v) => {
      expect(isLikelyPhone(v)).toBe(false)
    }
  )

  it('only a new phone is checked: an old odd one never blocks other edits', () => {
    expect(clientPatchSchema.safeParse({ phone: 'дзвонити після 18' }).success).toBe(false)
    expect(clientPatchSchema.safeParse({ name: 'Олена' }).success).toBe(true)
  })
})

describe('company size is a choice', () => {
  it('an old free text maps to a LinkedIn bucket, or stays as it was written', () => {
    expect(companySizeOf('51-200')).toBe('51–200')
    expect(companySizeOf('51–200 людей')).toBe('51–200')
    expect(companySizeOf('5000+')).toBe('5000+')
    expect(companySizeOf('201–800')).toBeNull()
    expect(companySizeOf('Напр.: багато')).toBeNull()
  })

  it('only a bucket (or empty) saves', () => {
    expect(companyPatchSchema.safeParse({ size: '11–50' }).success).toBe(true)
    expect(companyPatchSchema.safeParse({ size: '' }).success).toBe(true)
    expect(companyPatchSchema.safeParse({ size: 'дуже велика' }).success).toBe(false)
  })
})
