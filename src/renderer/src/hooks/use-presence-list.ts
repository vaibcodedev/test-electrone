import { useEffect, useState } from 'react'

export interface PresenceEntry<T> {
  key: string
  item: T
  /** Removed from the list: still rendered while it folds away, then dropped. */
  leaving: boolean
  /** Added after the first render: unfolds from zero height. Items present from the start don't animate. */
  entering: boolean
}

/** How long a removed entry stays; the same as `duration-200` in PRESENCE_CLASS. */
const LEAVE_MS = 200

/**
 * Puts removed entries back next to the item that preceded them, marked `leaving`. Exported for the unit test.
 */
export function mergePresence<T>(
  prev: readonly PresenceEntry<T>[],
  items: readonly T[],
  keyOf: (t: T) => string
): PresenceEntry<T>[] {
  const now = new Set(items.map(keyOf))
  const before = new Set(prev.map((e) => e.key))
  // Leaving entries grouped by the present item they followed (null — before every present item).
  const after = new Map<string | null, PresenceEntry<T>[]>()
  let anchor: string | null = null
  for (const e of prev) {
    if (now.has(e.key)) anchor = e.key
    else after.set(anchor, [...(after.get(anchor) ?? []), { ...e, leaving: true, entering: false }])
  }
  const out = [...(after.get(null) ?? [])]
  for (const item of items) {
    const key = keyOf(item)
    out.push({ key, item, leaving: false, entering: !before.has(key) })
    out.push(...(after.get(key) ?? []))
  }
  return out
}

/**
 * A list whose removed items fold away instead of vanishing (and added ones unfold): render the entries and
 * spread `presenceProps(entry)` on each item's element. `items` should be a stable (memoised) array.
 */
export function usePresenceList<T>(
  items: readonly T[],
  keyOf: (t: T) => string
): PresenceEntry<T>[] {
  const [seen, setSeen] = useState(items)
  const [entries, setEntries] = useState<PresenceEntry<T>[]>(() =>
    items.map((item) => ({ key: keyOf(item), item, leaving: false, entering: false }))
  )
  // Adjusting state to a new prop during render (react.dev «You might not need an effect»): no extra frame
  // where the removed item is already gone.
  if (items !== seen) {
    setSeen(items)
    setEntries(mergePresence(entries, items, keyOf))
  }
  const anyLeaving = entries.some((e) => e.leaving)
  useEffect(() => {
    if (!anyLeaving) return
    const t = window.setTimeout(
      () => setEntries((list) => list.filter((e) => !e.leaving)),
      LEAVE_MS
    )
    return () => window.clearTimeout(t)
  }, [anyLeaving, entries])
  return entries
}

/**
 * Height and opacity transition of a presence item. `interpolate-size` lets `height: auto` animate (Chromium
 * 129+); overflow is clipped only while folding, so focus outlines of a shown item are never cut. `min-h-0
 * shrink-0`: in a flex column (every such list) an item's automatic minimum height is its content while overflow
 * is visible — the unfolding row stood at full height at once and only faded in, the list below it jumped.
 */
const PRESENCE_CLASS =
  'min-h-0 shrink-0 [interpolate-size:allow-keywords] transition-[height,opacity] duration-200 ease-soft data-entering:starting:h-0 data-entering:starting:overflow-hidden data-entering:starting:opacity-0 data-leaving:h-0 data-leaving:overflow-hidden data-leaving:opacity-0 motion-reduce:transition-none'

export function presenceProps(entry: PresenceEntry<unknown>): {
  className: string
  'data-leaving'?: ''
  'data-entering'?: ''
  inert?: boolean
} {
  return {
    className: PRESENCE_CLASS,
    'data-leaving': entry.leaving ? '' : undefined,
    'data-entering': entry.entering ? '' : undefined,
    // A folding item is out of Tab order and of the accessibility tree at once.
    inert: entry.leaving || undefined
  }
}
