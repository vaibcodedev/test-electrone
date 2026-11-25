import { useMemo } from 'react'
import type { EntityType } from '@shared/entity-types'
import type { EntityRef } from '@shared/domain/common'
import { useApi } from '@/lib/query'

export interface Favorites {
  /** The record is in Обране (★). */
  has(ref: EntityRef): boolean
  /** How many favourites a type has (the «Обране» chip shows only when there are some). */
  count(type: EntityType): number
}

/**
 * Обране for marks and chips: one shared query (`pins.refs('favorite')`, ids only, the trash left out).
 * The lookup tables are memoised on `data`, not built in `select`: `useApi` keeps TData = TQueryFnData,
 * and TanStack Query reruns an inline `select` whenever its reference changes.
 */
export function useFavorites(): Favorites {
  const { data } = useApi('pins', 'refs', 'favorite')
  return useMemo(() => {
    const keys = new Set<string>()
    const perType = new Map<EntityType, number>()
    for (const r of data ?? []) {
      keys.add(`${r.type}:${r.id}`)
      perType.set(r.type, (perType.get(r.type) ?? 0) + 1)
    }
    return {
      has: (ref) => keys.has(`${ref.type}:${ref.id}`),
      count: (type) => perType.get(type) ?? 0
    }
  }, [data])
}
