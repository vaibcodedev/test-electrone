import { useMemo, useState } from 'react'
import { withViewTransition } from '@/lib/view-transition'

/** Rows a side list shows before «Показати ще»: the aside also holds tags, links, mentions and files. */
export const FOLD_FIRST = 5

export interface Fold<T> {
  /** The rows to render: the first ones, or all after «Показати ще». */
  shown: readonly T[]
  /** More rows than fit folded: the button is needed. */
  foldable: boolean
  all: boolean
  rest: number
  toggle: () => void
}

/**
 * A long side list folded to its first rows (links, mentions, files). The toggle runs as one view transition:
 * the rows and whatever reflows around them (a board's designs) move once, smoothly. Pass a stable array (memoised
 * or a constant for «empty»).
 */
export function useFold<T>(items: readonly T[], first = FOLD_FIRST): Fold<T> {
  const [all, setAll] = useState(false)
  const shown = useMemo(() => (all ? items : items.slice(0, first)), [all, items, first])
  return {
    shown,
    foldable: items.length > first,
    all,
    rest: items.length - shown.length,
    toggle: () => withViewTransition(() => setAll((a) => !a))
  }
}
