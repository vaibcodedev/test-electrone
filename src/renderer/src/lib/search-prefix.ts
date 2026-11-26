import { ENTITY_META, ENTITY_TYPES, type EntityType } from '@shared/entity-types'

/** Ctrl+K type filter: «сн: debounce» searches snippets only. A new entity type gets its prefix here. */
export const SEARCH_PREFIX: Record<EntityType, string> = {
  idea: 'ід',
  board: 'дш',
  card: 'кт',
  claude: 'кд',
  library: 'бб',
  component: 'кп',
  design: 'дз',
  moodboard: 'дб',
  snippet: 'сн',
  client: 'кл',
  project: 'пр',
  checklist: 'чл',
  fix: 'пм',
  bookmark: 'зк',
  word: 'сл',
  event: 'пд',
  note: 'нт',
  proposal: 'вг',
  template: 'шб',
  case: 'кс',
  redflag: 'пц',
  application: 'вк',
  company: 'км',
  question: 'пт'
}

/** Typed instead of a query, lists every prefix. */
export const PREFIX_HELP = '?'

const TYPE_BY_PREFIX = new Map<string, EntityType>(
  ENTITY_TYPES.map((t) => [SEARCH_PREFIX[t], t])
)

export interface ParsedSearch {
  /** The type the prefix names, or null for a search everywhere. */
  type: EntityType | null
  /** The query without the prefix. */
  query: string
}

/** Only a known prefix is a filter: «http://…» or «todo: …» stay ordinary text. */
export function parseSearch(text: string): ParsedSearch {
  const trimmed = text.trim()
  const match = /^([^\s:]+):(.*)$/s.exec(trimmed)
  const type = match && TYPE_BY_PREFIX.get(match[1].toLowerCase())
  return match && type ? { type, query: match[2].trim() } : { type: null, query: trimmed }
}

/** What the input holds once a filter is picked. */
export function withPrefix(type: EntityType, query = ''): string {
  return `${SEARCH_PREFIX[type]}: ${query}`
}

/**
 * Filters to offer while the user types: the text is a prefix («сн») or starts a section's name
 * («сніп», «питань»). The exact prefix comes first.
 */
export function suggestPrefixes(text: string): EntityType[] {
  const needle = text.trim().toLowerCase()
  if (needle === PREFIX_HELP) return [...ENTITY_TYPES]
  if (needle.length < 2) return []
  const exact = TYPE_BY_PREFIX.get(needle)
  const byName = ENTITY_TYPES.filter((t) => {
    if (t === exact) return false
    const name = ENTITY_META[t].plural.toLowerCase()
    return name.startsWith(needle) || name.split(/[\s-]+/).some((word) => word.startsWith(needle))
  })
  return exact ? [exact, ...byName] : byName
}
