/** Validation messages shown in toasts: which field, and which record of a list. */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { configureZod, describeZodError } from '@shared/zod-locale'

configureZod()

const errorOf = (schema: z.ZodType, value: unknown): string => {
  const r = schema.safeParse(value)
  if (r.success) throw new Error('expected a validation error')
  return describeZodError(r.error)
}

describe('describeZodError', () => {
  it('a value of an array field names the field, not «Запис 1»', () => {
    const msg = errorOf(z.object({ tags: z.array(z.string().max(3)) }), { tags: ['задовга мітка'] })
    expect(msg).toMatch(/^Мітки: /)
  })

  it('a record of an imported list keeps its number', () => {
    const items = z.array(z.object({ title: z.string().min(1) }))
    const list = Array.from({ length: 38 }, () => ({ title: 'x' }))
    list[37] = { title: '' }
    expect(errorOf(z.object({ items }), { items: list })).toMatch(/^Запис 38 → Назва: /)
    expect(errorOf(items, list)).toMatch(/^Запис 38 → Назва: /)
  })
})
