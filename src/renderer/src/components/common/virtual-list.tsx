import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtNumber, plural } from '@/lib/format'
import { Spinner } from '@/components/ui/spinner'
import { useUi } from '@/stores/ui-store'
import { CardSkeleton, Delayed, RowSkeleton } from './page-skeleton'
import { EmptyState } from './page'

/**
 * Entrance motion for list rows: rows that are new among the list's leading items (first load, new search,
 * another filter) fade up one after another; rows that stayed (a neighbour deleted, a search narrowed) don't
 * replay it, and rows that mount later while scrolling appear instantly, so scrolling never feels sluggish.
 */
const ENTER_WINDOW_MS = 600
/** Lists shorter than this don't need an "end of list" note. */
const END_NOTE_FROM = 20

function ListEnd({ loading, total }: { loading: boolean; total: number }) {
  return (
    <div className="col-span-full flex items-center justify-center gap-2 py-4 text-caption text-muted-foreground">
      {loading ? (
        <>
          <Spinner /> Завантажую ще…
        </>
      ) : (
        <>
          Це всі {fmtNumber(total)} {plural(total, ['запис', 'записи', 'записів'])}
        </>
      )}
    </div>
  )
}
/** Keys of `keys` missing from `before`, each with its order among the new ones (the cascade delay). */
function freshKeys(keys: string[], before: string[]): Map<string, number> {
  const old = new Set(before)
  const fresh = new Map<string, number>()
  for (const k of keys) if (!old.has(k)) fresh.set(k, fresh.size)
  return fresh
}

const NONE_FRESH = new Map<string, number>()

function useEntering(
  keys: string[]
): (index: number, key: string) => { className?: string; style?: CSSProperties } {
  const signature = keys.join('|')
  const [state, setState] = useState(() => ({ signature, keys, fresh: freshKeys(keys, []) }))
  if (state.signature !== signature)
    setState({ signature, keys, fresh: freshKeys(keys, state.keys) })
  // The window closes on a timer, not by reading the clock in render: rows remounted later by scrolling stay still.
  useEffect(() => {
    const t = setTimeout(
      () => setState((s) => (s.signature === signature ? { ...s, fresh: NONE_FRESH } : s)),
      ENTER_WINDOW_MS
    )
    return () => clearTimeout(t)
  }, [signature])
  // Rows being sent to the trash (see DetailPane) play the leave animation.
  const leaving = useUi((s) => s.leaving)
  return (index, key) => {
    if (leaving[key]) return { className: 'pointer-events-none animate-leave' }
    const order = state.fresh.get(key)
    return order !== undefined && index < 10
      ? { className: 'animate-enter', style: { animationDelay: `${Math.min(order, 8) * 18}ms` } }
      : {}
  }
}

/** Brings the open record into view once per key: one just created, or opened from search or a link. */
function useScrollToActive(
  activeKey: string | null | undefined,
  index: number,
  scrollTo: (index: number) => void
): void {
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (!activeKey) {
      done.current = null
      return
    }
    if (activeKey === done.current || index < 0) return
    done.current = activeKey
    scrollTo(index)
  }, [activeKey, index, scrollTo])
}

/** A failed list request is not an empty list: «… поки немає» would invite duplicates. */
function ListError({ onRetry }: { onRetry?: () => void }): ReactElement {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Не вдалося завантажити список"
      hint="Дані на місці — спробуйте ще раз."
      cta={onRetry && { label: 'Повторити', icon: RotateCcw, onClick: onRetry }}
    />
  )
}

interface InfiniteProps {
  /** More pages can be loaded. */
  hasMore?: boolean
  loadingMore?: boolean
  /** Called when the last rendered row comes into view. */
  onLoadMore?: () => void
  /** The list request failed: an error with «Повторити» instead of `empty`. */
  error?: boolean
  onRetry?: () => void
  /** Key of the open record (`?open=`): scrolled into view when it changes. */
  activeKey?: string | null
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
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  error,
  onRetry,
  activeKey
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
  /** First page is loading: skeleton rows/cards of the real size instead of an empty state. */
  loading?: boolean
} & InfiniteProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  // Last row: "loading more" while pages remain, «Це всі N записів» once a long list is complete.
  const showEnd = !hasMore && items.length >= END_NOTE_FROM
  const count = items.length + (hasMore || showEnd ? 1 : 0)
  const entering = useEntering(items.slice(0, 12).map((it, i) => getKey(it, i)))
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

  const activeIndex = activeKey ? items.findIndex((it, i) => getKey(it, i) === activeKey) : -1
  const scrollTo = useCallback(
    (i: number) => virtualizer.scrollToIndex(i, { align: 'auto' }),
    [virtualizer]
  )
  useScrollToActive(activeKey, activeIndex, scrollTo)

  // scrollbar-gutter: the skeleton keeps the 8px the list keeps for its scrollbar, so the right edge doesn't jump.
  if (loading && !items.length)
    return (
      <div
        className={cn('min-h-0 flex-1 overflow-hidden scrollbar-gutter-stable', className)}
        aria-busy="true"
      >
        <Delayed delay={150}>
          <div className={cn('flex flex-col', innerClassName)} style={{ gap }}>
            {Array.from({ length: 8 }, (_, i) => (
              <RowSkeleton key={i} height={estimateSize} />
            ))}
          </div>
        </Delayed>
      </div>
    )
  if (!items.length && !hasMore)
    return (
      <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>
        {error ? <ListError onRetry={onRetry} /> : empty}
      </div>
    )

  return (
    // overflow-x-hidden: overflow-y:auto alone turns x into auto too, and a too-wide row gave a horizontal bar.
    <div
      ref={parentRef}
      className={cn('min-h-0 flex-1 overflow-x-hidden overflow-y-auto', className)}
    >
      <div
        className={cn('relative w-full', innerClassName)}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {row.index < items.length ? (
              // Inner wrapper animates: the outer one is positioned with transform by the virtualizer. data-row-key
              // lets a page find a row by record (focus the neighbour after «У кошик»).
              <div data-row-key={row.key} {...entering(row.index, String(row.key))}>
                {renderItem(items[row.index], row.index)}
              </div>
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
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  error,
  onRetry,
  activeKey
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
  /** First page is loading: skeleton rows/cards of the real size instead of an empty state. */
  loading?: boolean
} & InfiniteProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  // The scroll container appears only after the first page (a skeleton is shown before): a plain ref +
  // effect ran while it was missing and never observed it, so every grid stayed at the initial 3 columns.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [columns, setColumns] = useState(3)
  const fit = useCallback(
    (width: number) => setColumns(Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)))),
    [gap, minColumnWidth]
  )
  // Columns are counted as soon as the container exists (a ref runs in commit, before paint): waiting for
  // ResizeObserver drew a first frame of 3 columns, and the cards remounted and played their entrance twice.
  const setParent = useCallback(
    (el: HTMLDivElement | null) => {
      parentRef.current = el
      setScrollEl(el)
      if (!el) return
      const style = getComputedStyle(el)
      fit(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))
    },
    [fit]
  )

  useEffect(() => {
    if (!scrollEl) return
    const ro = new ResizeObserver(([entry]) => fit(entry.contentRect.width))
    ro.observe(scrollEl)
    return () => ro.disconnect()
  }, [scrollEl, fit])

  const rows = Math.ceil(items.length / columns)
  const showEnd = !hasMore && items.length >= END_NOTE_FROM
  const count = rows + (hasMore || showEnd ? 1 : 0)
  const entering = useEntering(items.slice(0, 12).map((it) => getKey(it)))
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

  const activeIndex = activeKey ? items.findIndex((it) => getKey(it) === activeKey) : -1
  const scrollTo = useCallback(
    (i: number) => virtualizer.scrollToIndex(Math.floor(i / columns), { align: 'auto' }),
    [virtualizer, columns]
  )
  useScrollToActive(activeKey, activeIndex, scrollTo)

  if (loading && !items.length)
    return (
      <div
        className={cn('min-h-0 flex-1 overflow-hidden scrollbar-gutter-stable', className)}
        aria-busy="true"
      >
        <Delayed delay={150}>
          {/* Same column rule as the real grid (auto-fill by minColumnWidth), cards of the estimated row height. */}
          <div
            className="grid"
            style={{
              gap,
              gridTemplateColumns: `repeat(auto-fill, minmax(min(${minColumnWidth}px, 100%), 1fr))`
            }}
          >
            {Array.from({ length: 8 }, (_, i) => (
              <CardSkeleton key={i} height={rowHeight} />
            ))}
          </div>
        </Delayed>
      </div>
    )
  if (!items.length && !hasMore)
    return (
      <div className={cn('min-h-0 flex-1 overflow-y-auto', className)}>
        {error ? <ListError onRetry={onRetry} /> : empty}
      </div>
    )

  return (
    <div
      ref={setParent}
      className={cn('min-h-0 flex-1 overflow-x-hidden overflow-y-auto', className)}
    >
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
              style={{
                transform: `translateY(${row.start}px)`,
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap
              }}
            >
              {row.index < rows ? (
                slice.map((item, i) => {
                  const key = getKey(item)
                  // The enter animation sits on the cell itself: the row carries the virtualizer's transform.
                  const e = entering(start + i, key)
                  return (
                    // min-w-0: a grid item never grows past its column (a long unbroken word used to push a card
                    // wider than the window); the card itself decides how to truncate.
                    // flex chain: the cell is stretched by the row, the card fills it — cards of a row are one height.
                    <div
                      key={key}
                      data-row-key={key}
                      className={cn('flex min-w-0 flex-col *:flex-1', e.className)}
                      style={e.style}
                    >
                      {renderItem(item, start + i)}
                    </div>
                  )
                })
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
