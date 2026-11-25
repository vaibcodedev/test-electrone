import { z } from 'zod'
import { entityRefSchema, type EntityRef, type EntitySummary } from './common'
import type { MentionFragment } from '../wikilinks'

/** Records a text links to, resolved in one call when it renders (a text rarely has more than a few). */
export const resolveLinksSchema = z.array(entityRefSchema).max(200)

/**
 * A link target as the text shows it: `live` opens, `trashed` is struck through («У кошику»), `missing` (deleted
 * for good, or never existed) shows the label from the text.
 */
export interface ResolvedLink extends EntityRef {
  title: string
  state: 'live' | 'trashed' | 'missing'
}

/** A record whose Markdown links to this one («Згадки»): the first mention with the words around it. */
export interface Mention extends EntitySummary {
  /** The link as it reads between the two halves of the fragment: the current title of the linked record. */
  label: string
  /** Text around the first link to this record. */
  fragment: MentionFragment
  /** How many times the record links here (one row per record). */
  count: number
}
