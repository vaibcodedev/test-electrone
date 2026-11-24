import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Page title block: big display type, optional subtitle and actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  children
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <header className={cn('flex flex-col gap-4 px-8 pt-7 pb-5', className)}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="font-display text-title max-w-[16ch] text-balance">{title}</h1>
          {subtitle && <div className="mt-2 text-[13px] text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

/** Scrollable page body inside the main panel. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-8 pb-8', className)}>{children}</div>
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex h-full min-h-0 flex-col', className)}>{children}</div>
}

/** Empty states tell the user what to do next, in one line, with the action right there. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className
}: {
  icon?: LucideIcon
  title: string
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center', className)}>
      {Icon && (
        <div className="grid size-14 place-items-center rounded-full bg-surface">
          <Icon className="size-6 text-muted-foreground" />
        </div>
      )}
      <div className="text-[15px] font-medium">{title}</div>
      {hint && <div className="max-w-sm text-[13px] text-muted-foreground">{hint}</div>}
      {action}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Поиск',
  className,
  autoFocus
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  return (
    <label
      className={cn(
        'flex h-9 items-center gap-2 rounded-full bg-surface px-3.5 text-[13px] focus-within:ring-[3px] focus-within:ring-ring/25',
        className
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/80"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation()
            onChange('')
          }
        }}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </label>
  )
}

export interface ChipOption<T extends string> {
  value: T
  label: string
  count?: number
}

/** Pill filter chips (selected = lime). Pass `allLabel` to include a "show all" chip. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  allLabel,
  className
}: {
  options: ChipOption<T>[]
  value: T | undefined
  onChange: (value: T | undefined) => void
  allLabel?: string
  className?: string
}) {
  const chip = (active: boolean): string =>
    cn(
      'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] whitespace-nowrap transition-colors',
      active ? 'bg-lime text-lime-foreground font-medium' : 'bg-surface text-foreground hover:bg-accent'
    )
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {allLabel && (
        <button type="button" className={chip(value === undefined)} onClick={() => onChange(undefined)}>
          {allLabel}
        </button>
      )}
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={chip(value === o.value)}
          onClick={() => onChange(value === o.value && allLabel ? undefined : o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular-nums opacity-55">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Segmented progress bar (from the reference "Active order" card). */
export function SegmentBar({
  value,
  total,
  segments = 4,
  className,
  tone = 'lime'
}: {
  value: number
  total: number
  segments?: number
  className?: string
  tone?: 'lime' | 'ink'
}) {
  const ratio = total ? Math.min(1, value / total) : 0
  return (
    <div className={cn('flex gap-1', className)} role="progressbar" aria-valuenow={value} aria-valuemax={total}>
      {Array.from({ length: segments }, (_, i) => {
        const fill = Math.max(0, Math.min(1, ratio * segments - i))
        return (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-current/15">
            <div
              className={cn('h-full rounded-full', tone === 'lime' ? 'bg-lime' : 'bg-ink dark:bg-ink-foreground')}
              style={{ width: `${fill * 100}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-card px-1 font-sans text-[11px] text-muted-foreground',
        className
      )}
    >
      {children}
    </kbd>
  )
}
