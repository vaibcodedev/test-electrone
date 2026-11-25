import { z } from 'zod'
import { MAX } from './limits'
import type { EntityType } from '../entity-types'
import type { PaletteColor } from '../colors'
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
  title: z.string().trim().min(1).max(MAX.title),
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
  /** Optional second reminder, minutes before start. */
  remind2Minutes: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 30)
    .nullable()
    .default(null),
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
  remind2Minutes: number | null
  reminded2For: number | null
  /** Set when the event is owned by another module (e.g. an interview stage). */
  sourceType: string | null
  sourceId: string | null
}

export const rangeSchema = z.object({ from: timestampSchema, to: timestampSchema })
export type DateRange = z.infer<typeof rangeSchema>

/**
 * Colours of the items other modules put on the calendar: one per legend entry, pairwise distinct.
 * A test-task deadline is part of the interview stage and shares its colour (one «Співбесіда» in the legend).
 */
export const FEED_COLOR: Record<'payment' | 'project' | 'interview' | 'subscription' | 'followup', PaletteColor> = {
  payment: '#f5a524',
  project: '#f06b6b',
  interview: '#7c8cf8',
  subscription: '#c98af0',
  followup: '#3fbf9b'
}

/** A single item placed on the calendar grid, from any module. */
export interface CalendarItem {
  key: string
  source: 'event' | 'card' | 'payment' | 'project' | 'interview' | 'subscription' | 'followup'
  ref: { type: EntityType; id: string }
  title: string
  startAt: number
  endAt: number | null
  allDay: boolean
  color: string | null
  done: boolean
  /** Where clicking the item leads (overrides the ref route). */
  route?: string
}
