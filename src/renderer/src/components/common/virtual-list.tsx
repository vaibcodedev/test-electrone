import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'
import { useUi } from '@/stores/ui-store'

/**
 * Entrance motion for list rows: rows that mount right after the list's leading items change
 * (first load, new search, another filter) fade up one after another; rows that mount later
 * while scrolling appear instantly, so scrolling never feels sluggish.
 */
const ENTER_WINDOW_MS = 600
/** Lists shorter than this don't need an "end of list" note. */
const END_NOTE_FROM = 20

function ListEnd({ loading, total }: { loading: boolean; total: number }) {
  return (
    <div className="col-span-full flex items-center justify-center gap-2 py-4 text-caption text-muted-foreground">
      {loading ? (
        <>
          <Spinner /> Загружаю ещё…
        </>
      ) : (
        <>Это все записи · {total}</>
      )}
    </div>
  )
}
function useEntering(signature: string): (index: number, key: string) => { className?: string; style?: CSSProperties } {
  const [state, setState] = useState(() => ({ signature, since: performance.now() }))
  if (state.signature !== signature) setState({ signature, since: performance.now() })
  // Rows being sent to the trash (see DetailPane) play the leave animation.
  const leaving = useUi((s) => s.leaving)
  return (index, key) =>
    leaving[key]
      ? { className: 'pointer-events-none animate-leave' }
      : index < 16 && performance.now() - state.since < ENTER_WINDOW_MS
        ? { className: 'animate-enter', style: { animationDelay: `${Math.min(index, 12) * 28}ms` } }
        : {}
}

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
  // Last row: "loading more" while pages remain, "that's all · N" once a long list is complete.
  const showEnd = !hasMore && items.length >= END_NOTE_FROM
  const count = items.length + (hasMore || showEnd ? 1 : 0)
  const entering = useEntering(items.slice(0, 12).map((it, i) => getKey(it, i)).join('|'))
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
              // Inner wrapper animates: the outer one is positioned with transform by the virtualizer.
              <div {...entering(row.index, getKey(items[row.index], row.index))}>{renderItem(items[row.index], row.index)}</div>
            ) : (
              <ListEnd loading={!!hasMore} total={items.length} />
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
  const showEnd = !hasMore && items.length >= END_NOTE_FROM
  const count = rows + (hasMore || showEnd ? 1 : 0)
  const entering = useEntering(items.slice(0, 12).map((it) => getKey(it)).join('|'))
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
                slice.map((item, i) => (
                  <div key={getKey(item)} {...entering(start + i, getKey(item))}>
                    {renderItem(item, start + i)}
                  </div>
                ))
              ) : (
                <ListEnd loading={!!hasMore} total={items.length} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
