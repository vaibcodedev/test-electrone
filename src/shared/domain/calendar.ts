import { z } from 'zod'
import type { EntityType } from '../entity-types'
import {
  hexColorSchema,
  timestampSchema,
  withTagIds,
  type EntityBase,
  type WithTags,
  patchOf
} from './common'

export const RECURRENCES = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const
export type Recurrence = (typeof RECURRENCES)[number]

export const eventInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20_000).default(''),
  startAt: timestampSchema,
  endAt: timestampSchema.nullable().default(null),
  allDay: z.boolean().default(false),
  /** Minutes before start; null = no reminder. */
  remindMinutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30)
    .nullable()
    .default(15),
  recurrence: z.enum(RECURRENCES).default('none'),
  color: hexColorSchema.default(null),
  ...withTagIds
})
export const eventPatchSchema = patchOf(eventInputSchema)
export type EventInput = z.input<typeof eventInputSchema>
export type EventPatch = z.input<typeof eventPatchSchema>

export interface CalendarEvent extends EntityBase, WithTags {
  title: string
  description: string
  startAt: number
  endAt: number | null
  allDay: boolean
  remindMinutes: number | null
  recurrence: Recurrence
  color: string | null
  /** Start time of the occurrence a reminder was last sent for. */
  remindedFor: number | null
}

export const rangeSchema = z.object({ from: timestampSchema, to: timestampSchema })
export type DateRange = z.infer<typeof rangeSchema>

/** A single item placed on the calendar grid, from any module. */
export interface CalendarItem {
  key: string
  source: 'event' | 'card' | 'payment' | 'project'
  ref: { type: EntityType; id: string }
  title: string
  startAt: number
  endAt: number | null
  allDay: boolean
  color: string | null
  done: boolean
}
