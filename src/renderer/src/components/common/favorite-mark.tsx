import type { ReactElement } from 'react'
import { Star } from 'lucide-react'
import type { EntityRef } from '@shared/domain/common'
import { useFavorites } from '@/hooks/use-favorites'
import { cn } from '@/lib/utils'

/**
 * ★ after a record's title in lists, search and links when it's in Обране. Never truncated (shrink-0):
 * wrap the title in `flex min-w-0 items-center gap-1.5` and give the title itself `truncate`.
 * On an ink row the star takes ink-foreground — the amber fill drowns in the dark ink.
 */
export function FavoriteMark({
  entity,
  onInk,
  className
}: {
  entity: EntityRef
  onInk?: boolean
  className?: string
}): ReactElement | null {
  const fav = useFavorites()
  if (!fav.has(entity)) return null
  return (
    <span
      role="img"
      aria-label="В обраному"
      title="В обраному"
      className={cn('inline-flex shrink-0', className)}
    >
      <Star
        aria-hidden
        className={cn(
          'size-3.5',
          onInk ? 'fill-ink-foreground text-ink-foreground' : 'fill-warn-fill text-warn-fill'
        )}
      />
    </span>
  )
}
