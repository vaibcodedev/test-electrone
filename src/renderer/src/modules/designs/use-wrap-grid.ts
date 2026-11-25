import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

/** The board's tile: at least 240px wide, 4:3 (SortableDesign), 12px apart (gap-3). */
const MIN_TILE = 240
const GAP = 12
/** Narrower than three columns the aside goes above the designs: beside them it would leave one column. */
const MIN_COLS_BESIDE = 3

/**
 * A grid of tiles that flows around a side column, like text around a float: the header takes the first row
 * left of the aside, the aside takes the last column for as many rows as its height needs, and the tiles fill
 * the cells left of it and then the full width below. CSS grid can't wrap around a float by itself, so the
 * rows the aside spans are counted from the measured heights (ResizeObserver), with `grid-auto-flow: dense`.
 */
export function useWrapGrid(): {
  gridRef: RefObject<HTMLDivElement | null>
  headerRef: RefObject<HTMLElement | null>
  asideRef: RefObject<HTMLElement | null>
  gridStyle: CSSProperties
  headerStyle: CSSProperties
  asideStyle: CSSProperties
  /** For a full-row item left of the aside (the empty state). */
  mainStyle: CSSProperties
} {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const asideRef = useRef<HTMLElement | null>(null)
  const [size, setSize] = useState({ width: 0, header: 0, aside: 0 })

  useLayoutEffect(() => {
    const grid = gridRef.current
    const header = headerRef.current
    const aside = asideRef.current
    if (!grid || !header || !aside) return
    const measure = (): void => {
      const next = {
        width: grid.clientWidth,
        header: header.offsetHeight,
        aside: aside.offsetHeight
      }
      setSize((prev) =>
        prev.width === next.width && prev.header === next.header && prev.aside === next.aside
          ? prev
          : next
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(grid)
    ro.observe(header)
    ro.observe(aside)
    return () => ro.disconnect()
  }, [])

  const cols = Math.max(1, Math.floor((size.width + GAP) / (MIN_TILE + GAP)))
  const beside = cols >= MIN_COLS_BESIDE
  const rowHeight = ((size.width - (cols - 1) * GAP) / cols) * 0.75
  // Row 1 is the header's; each tile row below adds rowHeight + GAP to the aside's area.
  const tileRows =
    rowHeight > 0 ? Math.max(0, Math.ceil((size.aside - size.header) / (rowHeight + GAP))) : 0
  const left = `1 / ${cols}`

  return {
    gridRef,
    headerRef,
    asideRef,
    gridStyle: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` },
    headerStyle: { gridColumn: beside ? left : '1 / -1', gridRow: 1 },
    asideStyle: beside
      ? { gridColumn: `${cols} / ${cols + 1}`, gridRow: `1 / span ${1 + tileRows}` }
      : { gridColumn: '1 / -1' },
    mainStyle: { gridColumn: beside ? left : '1 / -1' }
  }
}
