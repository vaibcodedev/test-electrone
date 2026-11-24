import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { MAX } from '@shared/domain/limits'
import { patchOf } from '@shared/domain/common'
import { ideaInputSchema, ideaPatchSchema } from '@shared/domain/ideas'
import { boardInputSchema, boardPatchSchema, cardInputSchema } from '@shared/domain/boards'
import { proposalInputSchema, templateInputSchema } from '@shared/domain/freelance'
import { withdrawalInputSchema, withdrawalPatchSchema } from '@shared/domain/finance'
import { limitsOf } from '@/lib/limits'

/** Every module of src/shared/domain, to check all schemas at once (new modules are picked up automatically). */
const modules = import.meta.glob('../../src/shared/domain/*.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>
const isObjectSchema = (v: unknown): v is z.ZodObject => v instanceof z.ZodObject
const exportsMatching = (re: RegExp): [string, z.ZodObject][] =>
  Object.values(modules).flatMap((m) =>
    Object.entries(m).filter(
      (e): e is [string, z.ZodObject] => re.test(e[0]) && isObjectSchema(e[1])
    )
  )

const ID = 'x'.repeat(21)

describe('patchOf (zod 4: .partial() would inject defaults)', () => {
  it('a partial patch carries only the provided fields', () => {
    expect(ideaPatchSchema.parse({ title: 'Нова назва' })).toEqual({ title: 'Нова назва' })
    expect(withdrawalPatchSchema.parse({ amount: 10 })).toEqual({ amount: 10 })
  })

  it('demonstrates the pitfall it guards against: plain .partial() fills defaults', () => {
    const partial = ideaInputSchema.partial().parse({ title: 'x' }) as Record<string, unknown>
    expect(Object.keys(partial).length).toBeGreaterThan(1)
  })

  it('keeps validation of the provided fields', () => {
    expect(() => ideaPatchSchema.parse({ title: '' })).toThrow()
    expect(() => ideaPatchSchema.parse({ title: 'x'.repeat(MAX.title + 1) })).toThrow()
    expect(() => withdrawalPatchSchema.parse({ amount: -1 })).toThrow()
  })

  it('allows explicit null for nullable fields (received → auto)', () => {
    expect(withdrawalPatchSchema.parse({ received: null })).toEqual({ received: null })
  })

  it('extra fields after .extend() stay optional', () => {
    expect(boardPatchSchema.parse({ archived: true })).toEqual({ archived: true })
  })

  it('helper works on any object schema', () => {
    const s = patchOf(
      z.object({ a: z.string().default('A'), b: z.number().default(1), c: z.boolean() })
    )
    expect(s.parse({})).toEqual({})
    expect(s.parse({ c: false })).toEqual({ c: false })
  })

  const patches = exportsMatching(/PatchSchema$/)
  it('finds the patch schemas', () => {
    expect(patches.length).toBeGreaterThan(30)
  })
  it.each(patches)('%s.parse({}) adds no defaults', (_name, schema) => {
    expect(schema.parse({})).toEqual({})
  })
})

describe('MAX limits on titles', () => {
  it('MAX values', () => {
    expect(MAX).toEqual({ title: 500, name: 200, label: 100 })
  })

  it('a 500-char idea title fits a board and a card («Розібрати ідею: …» is sliced)', () => {
    const title = 'І'.repeat(MAX.title)
    expect(ideaInputSchema.parse({ title }).title).toHaveLength(MAX.title)
    expect(boardInputSchema.parse({ title }).title).toHaveLength(MAX.title)
    expect(() =>
      cardInputSchema.parse({
        boardId: ID,
        columnId: ID,
        title: `Розібрати ідею: ${title}`.slice(0, MAX.title)
      })
    ).not.toThrow()
  })

  it('a proposal job title fits a template title (proposals.toTemplate)', () => {
    expect(limitsOf(templateInputSchema).title).toBe(limitsOf(proposalInputSchema).jobTitle)
  })

  const inputs = exportsMatching(/InputSchema$/).filter(([, s]) => 'title' in s.shape)
  it.each(inputs)('%s: title limit is MAX.title (columns: MAX.label)', (name, schema) => {
    const limit = limitsOf(schema).title
    expect(limit).toBe(name === 'columnInputSchema' ? MAX.label : MAX.title)
  })

  it('withdrawal defaults are applied on create', () => {
    const w = withdrawalInputSchema.parse({ amount: 100, at: Date.now() })
    expect(w).toMatchObject({
      fee: 0,
      rate: 1,
      currency: 'USD',
      receivedCurrency: 'UAH',
      received: null
    })
  })
})
