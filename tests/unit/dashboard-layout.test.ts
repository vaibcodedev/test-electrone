/** Home grid: the tiles left in a row share all 12 columns. */
import { describe, expect, it } from 'vitest'
import { COL_SPAN, rowSpans } from '@/features/dashboard/layout'

describe('rowSpans', () => {
  it('splits 12 columns in proportion to the base widths', () => {
    expect(rowSpans([6, 3, 3])).toEqual([6, 3, 3])
    expect(rowSpans([6, 3])).toEqual([8, 4])
    expect(rowSpans([3, 3])).toEqual([6, 6])
    expect(rowSpans([7])).toEqual([12])
    expect(rowSpans([7, 5])).toEqual([7, 5])
    expect(rowSpans([])).toEqual([])
  })

  it('always fills the row with spans that have a class', () => {
    for (const bases of [
      [6, 3, 3],
      [6, 3],
      [3, 3],
      [7],
      [5],
      [4, 4, 4],
      [6, 6],
      [7, 5],
      [3],
      [6],
      [5, 7]
    ]) {
      const spans = rowSpans(bases)
      expect(spans.reduce((a, b) => a + b, 0)).toBe(12)
      for (const s of spans) expect(COL_SPAN[s]).toBe(`col-span-${s}`)
    }
  })
})
