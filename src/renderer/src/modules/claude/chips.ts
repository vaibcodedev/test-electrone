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
