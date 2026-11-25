/**
 * Create / save forms (useFormGate, FormDialog): which fields the schema requires (requiredOf) and why a form can't
 * be sent (blockReason) — the reason a disabled submit shows in its tooltip.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { requiredOf } from '@/lib/limits'
import { blockReason, FILL_REQUIRED, type ControlState } from '@/lib/form-validity'
import { FIX_ERRORS } from '@/lib/edit-session'
import { boardInputSchema } from '@shared/domain/boards'
import { eventInputSchema } from '@shared/domain/calendar'
import { checklistInputSchema } from '@shared/domain/checklists'
import { clientInputSchema, credentialInputSchema, projectInputSchema } from '@shared/domain/crm'
import { expenseInputSchema, subscriptionInputSchema } from '@shared/domain/finance'
import { goalInputSchema, platformInputSchema } from '@shared/domain/freelance'
import { resumeInputSchema } from '@shared/domain/jobs'
import { wordInputSchema } from '@shared/domain/english'

describe('requiredOf', () => {
  it('a non-empty string, a number and an enum without a default are required; the rest is not', () => {
    const schema = z.object({
      title: z.string().trim().min(1).max(200),
      note: z.string().max(200).default(''),
      kind: z.enum(['a', 'b']),
      period: z.enum(['a', 'b']).default('a'),
      amount: z.number().positive(),
      due: z.number().nullable().default(null),
      url: z.string().optional(),
      code: z.string().max(10),
      done: z.boolean()
    })
    expect(requiredOf(schema)).toEqual({ title: true, kind: true, amount: true })
  })

  it('names and titles the forms mark required come from the schemas', () => {
    expect(requiredOf(boardInputSchema).title).toBe(true)
    expect(requiredOf(eventInputSchema).title).toBe(true)
    expect(requiredOf(checklistInputSchema).title).toBe(true)
    expect(requiredOf(clientInputSchema).name).toBe(true)
    expect(requiredOf(projectInputSchema).title).toBe(true)
    expect(requiredOf(credentialInputSchema).label).toBe(true)
    expect(requiredOf(platformInputSchema).name).toBe(true)
    expect(requiredOf(resumeInputSchema).title).toBe(true)
    expect(requiredOf(expenseInputSchema).title).toBe(true)
    expect(requiredOf(expenseInputSchema).amount).toBe(true)
    expect(requiredOf(subscriptionInputSchema).title).toBe(true)
    expect(requiredOf(wordInputSchema).term).toBe(true)
    // A goal may go without a title (the metric names it); its target can't.
    expect(requiredOf(goalInputSchema).title).toBeUndefined()
    expect(requiredOf(goalInputSchema).target).toBe(true)
  })
})

const control = (over: Partial<ControlState> = {}): ControlState => ({
  required: false,
  blank: false,
  valid: true,
  disabled: false,
  label: '',
  ...over
})

describe('blockReason', () => {
  it('nothing missing, nothing wrong: the form can be sent', () => {
    expect(
      blockReason([control(), control({ required: true, label: 'Назва' })], false)
    ).toBeUndefined()
  })

  it('names the required fields still empty, once each', () => {
    const controls = [
      control({ required: true, blank: true, label: 'Назва' }),
      control({ required: true, blank: true, label: ' Сума ' }),
      control({ required: true, blank: true, label: 'Назва' }),
      control({ blank: true, label: 'Нотатка' })
    ]
    expect(blockReason(controls, false)).toBe('Заповніть: Назва, Сума')
  })

  it('a missing field without a label still says what to do', () => {
    expect(blockReason([control({ required: true, blank: true })], false)).toBe(FILL_REQUIRED)
  })

  it('a field that shows an error comes first', () => {
    const controls = [control({ required: true, blank: true, label: 'Назва' })]
    expect(blockReason(controls, true)).toBe(FIX_ERRORS)
    expect(blockReason([control({ valid: false }), ...controls], false)).toBe(FIX_ERRORS)
  })

  it('a disabled control is neither missing nor wrong', () => {
    const controls = [
      control({ disabled: true, required: true, blank: true, label: 'Хвилин' }),
      control({ disabled: true, valid: false })
    ]
    expect(blockReason(controls, false)).toBeUndefined()
  })
})
