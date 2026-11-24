import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

interface InfiniteProps {
  /** More pages can be loaded. */
  hasMore?: boolean
  loadingMore?: boolean
  /** Called when the last rendered row comes into view. */
  onLoadMore?: () => void
}

/**
 * Virtualized vertical list (TanStack Virtual) with dynamic row heights and infinite loading.
 * Owns its scroll container — give it a bounded height (flex-1/min-h-0 or h-…).
 */
export function VirtualList<T>({
  items,
  getKey,
  renderItem,
  estimateSize = 64,
  gap = 6,
  overscan = 8,
  className,
  innerClassName,
  empty,
  hasMore,
  loadingMore,
  onLoadMore
}: {
  items: T[]
  getKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  estimateSize?: number
  gap?: number
  overscan?: number
  className?: string
  innerClassName?: string
  empty?: ReactNode
} & InfiniteProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const count = items.length + (hasMore ? 1 : 0)
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns mutable functions by design
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    getItemKey: (index) => (index < items.length ? getKey(items[index], index) : '__loader__')
  })
  const virtualItems = virtualizer.getVirtualItems()
  const last = virtualItems[virtualItems.length - 1]

  useEffect(() => {
    if (last && last.index >= items.length - 1 && hasMore && !loadingMore) onLoadMore?.()
  }, [last, items.length, hasMore, loadingMore, onLoadMore])

  if (!items.length && !hasMore) return <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>{empty}</div>

  return (
    <div ref={parentRef} className={cn('min-h-0 flex-1 overflow-y-auto', className)}>
      <div className={cn('relative w-full', innerClassName)} style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {row.index < items.length ? (
              renderItem(items[row.index], row.index)
            ) : (
              <div className="flex items-center justify-center gap-2 py-4 text-[12.5px] text-muted-foreground">
                <Spinner /> Загружаю ещё…
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Virtualized responsive grid: column count follows the container width (minColumnWidth),
 * rows are virtualized. For galleries and card grids.
 */
export function VirtualGrid<T>({
  items,
  getKey,
  renderItem,
  minColumnWidth = 240,
  rowHeight = 240,
  gap = 12,
  className,
  empty,
  hasMore,
  loadingMore,
  onLoadMore
}: {
  items: T[]
  getKey: (item: T) => string
  renderItem: (item: T, index: number) => ReactNode
  minColumnWidth?: number
  /** Estimated row height (rows are measured after render). */
  rowHeight?: number
  gap?: number
  className?: string
  empty?: ReactNode
} & InfiniteProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(3)

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      setColumns(Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [gap, minColumnWidth])

  const rows = Math.ceil(items.length / columns)
  const count = rows + (hasMore ? 1 : 0)
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns mutable functions by design
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
    gap
  })
  const virtualRows = virtualizer.getVirtualItems()
  const last = virtualRows[virtualRows.length - 1]

  useEffect(() => {
    if (last && last.index >= rows - 1 && hasMore && !loadingMore) onLoadMore?.()
  }, [last, rows, hasMore, loadingMore, onLoadMore])

  if (!items.length && !hasMore) return <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>{empty}</div>

  return (
    <div ref={parentRef} className={cn('min-h-0 flex-1 overflow-y-auto', className)}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((row) => {
          const start = row.index * columns
          const slice = items.slice(start, start + columns)
          return (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 grid w-full"
              style={{ transform: `translateY(${row.start}px)`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap }}
            >
              {row.index < rows ? (
                slice.map((item, i) => <div key={getKey(item)}>{renderItem(item, start + i)}</div>)
              ) : (
                <div className="col-span-full flex items-center justify-center gap-2 py-4 text-[12.5px] text-muted-foreground">
                  <Spinner /> Загружаю ещё…
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
