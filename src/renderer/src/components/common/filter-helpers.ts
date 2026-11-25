/**
 * Filter chips for the values that have records, plus the selected one even at 0 (search narrowed it out):
 * the active filter stays visible, and an empty base shows no row of «0» chips.
 */
export function presentChips<K extends string>(
  values: readonly K[],
  counts: Partial<Record<K, number>>,
  label: (value: K) => string,
  selected: K | undefined
): { value: K; label: string; count: number }[] {
  return values
    .filter((v) => counts[v] || v === selected)
    .map((v) => ({ value: v, label: label(v), count: counts[v] ?? 0 }))
}

/**
 * Hint of an empty filter result, built from the conditions that are really active
 * (docs/design-system.md → Пустые состояния): the query, then «Скиньте фільтри.» when a chip or tag is on.
 */
export function noResultsHint(search: string, otherFilters: boolean): string {
  const q = search.trim()
  return [q && `За запитом «${q}» нічого немає.`, otherFilters && 'Скиньте фільтри.']
    .filter(Boolean)
    .join(' ')
}
