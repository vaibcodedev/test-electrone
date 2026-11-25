import { keepPreviousData } from '@tanstack/react-query'
import type { EntitySummary } from '@shared/domain/common'
import { useApi } from '@/lib/query'

/** A record offered by a picker: a search hit carries a text snippet, a recent record doesn't. */
export type EntityOptionItem = EntitySummary & { snippet?: string }

const NONE: EntityOptionItem[] = []

/**
 * Records to pick from (the «Зв’язати» picker, the «[[» menu): recently changed ones before anything is typed,
 * search hits after. The previous hits stay while the next query runs, so the list doesn't blink per letter.
 */
export function useEntitySearch(
  text: string,
  { enabled, recent = 15, hits = 20 }: { enabled: boolean; recent?: number; hits?: number }
): { items: EntityOptionItem[]; searching: boolean; loading: boolean } {
  const query = text.trim()
  const recentList = useApi('search', 'recent', recent, { enabled: enabled && !query })
  const found = useApi(
    'search',
    'query',
    { text: query, limit: hits },
    { enabled: enabled && !!query, placeholderData: keepPreviousData }
  )
  const active = query ? found : recentList
  return {
    items: active.data ?? NONE,
    searching: !!query,
    loading: active.isFetching && !active.data
  }
}
