import type { ReactElement } from 'react'
import { Star } from 'lucide-react'
import type { EntityType } from '@shared/entity-types'
import { useFavorites } from '@/hooks/use-favorites'
import { Toggle } from '@/components/ui/toggle'

/**
 * «Обране» chip in FilterBar.trailing, before TagFilter: leaves only the section's favourites. Neutral, not lime —
 * a secondary filter next to «Мітка»; the lime belongs to the main chip group. Hidden while the section has no
 * favourites (unless it's on, so it can be switched off).
 */
export function FavoriteFilter({
  type,
  value,
  onChange
}: {
  type: EntityType
  value: boolean
  onChange: (on: boolean) => void
}): ReactElement | null {
  const fav = useFavorites()
  if (!value && fav.count(type) === 0) return null
  return (
    <Toggle variant="chip-neutral" size="sm" pressed={value} onPressedChange={onChange}>
      <Star className={value ? 'fill-current' : undefined} /> Обране
    </Toggle>
  )
}
