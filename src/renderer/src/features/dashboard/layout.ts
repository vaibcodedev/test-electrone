/** Tailwind sees only whole class names, so every span the home grid can get is written out here. */
export const COL_SPAN: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12'
}

/**
 * The tiles left in one row of the 12-column home grid share it in proportion to their base widths:
 * [6,3,3] stays, [6,3] → [8,4], [3,3] → [6,6], [7] → [12]. Whole columns, the sum is always 12; the
 * columns left over by rounding down go to the largest remainders (the first tile on a tie).
 */
export function rowSpans(bases: number[]): number[] {
  if (bases.length === 0) return []
  const total = bases.reduce((a, b) => a + b, 0)
  const raw = bases.map((b) => (b * 12) / total)
  const spans = raw.map((r) => Math.max(1, Math.floor(r)))
  let left = 12 - spans.reduce((a, b) => a + b, 0)
  const byRemainder = raw
    .map((r, i) => ({ i, rest: r - Math.floor(r) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i)
  for (let k = 0; left > 0; k = (k + 1) % byRemainder.length, left--) spans[byRemainder[k].i]++
  return spans
}
