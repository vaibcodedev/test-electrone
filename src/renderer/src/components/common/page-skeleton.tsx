import { useEffect, useState, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Page skeletons that repeat the real layout of each page type (docs/design-system.md → Загрузка и скелетоны).
 * The route declares its kind via `handle: { skeleton }` in app/router.tsx; app-shell picks it for the Suspense
 * fallback. Nothing is shown for the first 150 ms: local chunks usually arrive faster, and a skeleton that
 * flashes for one frame looks worse than none.
 */
export type SkeletonKind = 'list' | 'grid' | 'board' | 'calendar' | 'dashboard' | 'overview' | 'form' | 'detail' | 'focus'

export const SKELETON_KINDS: readonly SkeletonKind[] = [
  'list',
  'grid',
  'board',
  'calendar',
  'dashboard',
  'overview',
  'form',
  'detail',
  'focus'
]

/** Shows children only after `delay` ms (no one-frame flash). */
export function Delayed({ delay, children }: { delay: number; children: ReactNode }) {
  const [visible, setVisible] = useState(delay === 0)
  useEffect(() => {
    if (delay === 0) return
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return visible ? <>{children}</> : null
}

/** Title + subtitle (+ optional action buttons on the right), like PageHeader. */
function HeaderStub({ actions = 1, chips = 0 }: { actions?: number; chips?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-56 rounded-2xl" />
          <Skeleton className="h-4 w-[26rem] max-w-full rounded-full" />
        </div>
        {actions > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: actions }, (_, i) => (
              <Skeleton key={i} className={cn('h-9 rounded-full', i === actions - 1 ? 'w-32' : 'w-28')} />
            ))}
          </div>
        )}
      </div>
      {chips > 0 && (
        <div className="flex items-center gap-2">
          {Array.from({ length: chips }, (_, i) => (
            <Skeleton key={i} className={cn('h-8 rounded-full', i === 0 ? 'w-14' : 'w-24')} />
          ))}
          <Skeleton className="ml-auto h-9 w-60 rounded-full" />
        </div>
      )}
    </div>
  )
}

/** One list row stub (title + meta line), height ≈ ListItem. */
export function RowSkeleton({ height = 64, className }: { height?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col justify-center gap-2 rounded-2xl bg-surface px-4', className)} style={{ height }}>
      <Skeleton className="h-3.5 w-2/5 rounded-full" />
      {height >= 52 && <Skeleton className="h-3 w-1/4 rounded-full" />}
    </div>
  )
}

/** One card stub for grids (image/code area + title + meta). */
export function CardSkeleton({ height = 220, className }: { height?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-3xl bg-surface p-3', className)} style={{ height }}>
      <Skeleton className="min-h-0 w-full flex-1 rounded-2xl" />
      <Skeleton className="h-3.5 w-3/5 rounded-full" />
      <Skeleton className="h-3 w-2/5 rounded-full" />
    </div>
  )
}

function ListLayout() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderStub chips={5} />
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

function GridLayout() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderStub chips={4} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

function BoardLayout() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderStub actions={2} />
      <div className="flex gap-3 overflow-hidden">
        {[4, 2, 3, 1].map((cards, i) => (
          <div key={i} className="flex w-[288px] shrink-0 flex-col gap-2 rounded-3xl bg-surface p-2">
            <Skeleton className="m-2 h-4 w-24 rounded-full" />
            {Array.from({ length: cards }, (_, j) => (
              <Skeleton key={j} className="h-16 rounded-2xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarLayout() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderStub actions={3} />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }, (_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function DashboardLayout() {
  return (
    <div className="grid grid-cols-12 gap-3">
      <Skeleton className="col-span-12 h-16 rounded-3xl" />
      <Skeleton className="col-span-8 h-72 rounded-3xl" />
      <Skeleton className="col-span-4 h-72 rounded-3xl" />
      <div className="col-span-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="col-span-3 h-[236px] rounded-3xl" />
      <Skeleton className="col-span-3 h-[236px] rounded-3xl" />
    </div>
  )
}

function OverviewLayout() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderStub actions={2} />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-3xl" />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-3">
        <Skeleton className="col-span-7 h-64 rounded-3xl" />
        <Skeleton className="col-span-5 h-64 rounded-3xl" />
        <Skeleton className="col-span-6 h-40 rounded-3xl" />
        <Skeleton className="col-span-6 h-40 rounded-3xl" />
      </div>
    </div>
  )
}

function FormLayout() {
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <HeaderStub actions={0} />
      {[2, 3, 4].map((rows, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-3xl bg-surface p-5">
          <Skeleton className="mb-1 h-4 w-32 rounded-full" />
          {Array.from({ length: rows }, (_, j) => (
            <div key={j} className="flex items-center justify-between rounded-2xl bg-card px-4 py-3">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-48 rounded-full" />
                <Skeleton className="h-3 w-72 max-w-full rounded-full" />
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function DetailLayout() {
  return (
    <div className="flex gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <Skeleton className="h-4 w-40 rounded-full" />
        <Skeleton className="h-10 w-80 max-w-full rounded-2xl" />
        <Skeleton className="h-28 rounded-3xl" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <RowSkeleton key={i} height={52} />
          ))}
        </div>
        <Skeleton className="h-40 rounded-3xl" />
      </div>
      <div className="flex w-64 shrink-0 flex-col gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="h-9 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Trainers (flashcards, question practice): a progress bar and one centred card. */
function FocusLayout() {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-1.5 flex-1 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="flex w-full max-w-2xl flex-col gap-4">
          <Skeleton className="h-[340px] rounded-[28px]" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

const LAYOUTS: Record<SkeletonKind, () => ReactNode> = {
  list: ListLayout,
  grid: GridLayout,
  board: BoardLayout,
  calendar: CalendarLayout,
  dashboard: DashboardLayout,
  overview: OverviewLayout,
  form: FormLayout,
  detail: DetailLayout,
  focus: FocusLayout
}

/** Suspense fallback for a lazy page chunk, shaped like the page that is loading. */
export function PageSkeleton({ kind = 'list', delay = 150 }: { kind?: SkeletonKind; delay?: number }) {
  const Layout = LAYOUTS[kind] ?? ListLayout
  return (
    <Delayed delay={delay}>
      <div className="h-full min-h-0 animate-page overflow-hidden px-8 pt-7 pb-8" aria-busy="true" aria-label="Завантаження сторінки">
        <Layout />
      </div>
    </Delayed>
  )
}
