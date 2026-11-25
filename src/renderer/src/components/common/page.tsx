/**
 * Page-level building blocks. Everything here is a thin composition of shadcn components
 * (Empty, InputGroup, ToggleGroup, Progress, Field, Kbd) — no hand-made controls.
 */
import { useId, type ReactElement, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReadOnly } from './detail-mode'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Progress } from '@/components/ui/progress'
import { Field as UiField, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Kbd as UiKbd } from '@/components/ui/kbd'
import { Button } from '@/components/ui/button'

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
    <header data-slot="page-header" className={cn('flex flex-col gap-4 px-8 pt-7 pb-5', className)}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="font-display text-title max-w-[18ch] text-balance">{title}</h1>
          {subtitle && <div className="mt-2 text-body text-muted-foreground">{subtitle}</div>}
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

/**
 * Empty state (shadcn Empty): says what to do next, with the action right there. `cta` is the usual
 * action — a soft button (the lime one stays in the page header: one accent per screen); `action` is
 * for anything else.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  cta,
  className
}: {
  icon?: LucideIcon
  title: string
  hint?: ReactNode
  action?: ReactNode
  cta?: { label: string; icon?: LucideIcon; onClick: () => void }
  className?: string
}) {
  const CtaIcon = cta?.icon
  return (
    <Empty className={cn('py-14', className)}>
      <EmptyHeader>
        {Icon && (
          <EmptyMedia variant="icon" className="size-14 rounded-full bg-surface">
            <Icon className="size-6 text-muted-foreground" />
          </EmptyMedia>
        )}
        <EmptyTitle className="text-lead font-medium">{title}</EmptyTitle>
        {hint && <EmptyDescription className="text-body">{hint}</EmptyDescription>}
      </EmptyHeader>
      {(action || cta) && (
        <EmptyContent>
          {cta && (
            <Button variant="soft" onClick={cta.onClick}>
              {CtaIcon && <CtaIcon />}
              {cta.label}
            </Button>
          )}
          {action}
        </EmptyContent>
      )}
    </Empty>
  )
}

/** Search field (shadcn InputGroup) with clear button and Esc to clear. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Пошук',
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
    // Same height as chips and sm buttons in the filter row (docs/design-system.md → Ряд фильтров).
    <InputGroup className={cn('h-8', className)}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        data-page-search
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation()
            onChange('')
          }
        }}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" className="rounded-full" aria-label="Очистити" onClick={() => onChange('')}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

export interface ChipOption<T extends string> {
  value: T
  label: string
  count?: number
}

const ALL = '__all__'

/** Selected chip of a secondary filter group: a neutral tint, so the screen keeps one lime filter group. */
const NEUTRAL_CHIP = 'on:bg-foreground/12 on:text-foreground on:font-medium on:focus-visible:ring-ring'

/**
 * Pill filter chips (shadcn ToggleGroup, variant "chip": selected = lime). `allLabel` adds a "show all" chip.
 * `tone="neutral"` — the second and further groups of a filter row (docs/design-system.md → Переключатели).
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  allLabel,
  className,
  size = 'sm',
  tone = 'accent'
}: {
  options: ChipOption<T>[]
  value: T | undefined
  onChange: (value: T | undefined) => void
  allLabel?: string
  className?: string
  size?: 'sm' | 'xs' | 'default'
  tone?: 'accent' | 'neutral'
}) {
  const itemClass = tone === 'neutral' ? NEUTRAL_CHIP : undefined
  return (
    <ToggleGroup
      type="single"
      variant="chip"
      size={size}
      value={value ?? (allLabel ? ALL : '')}
      onValueChange={(v) => {
        if (!v) return onChange(undefined)
        onChange(v === ALL ? undefined : (v as T))
      }}
      className={className}
    >
      {allLabel && (
        <ToggleGroupItem value={ALL} className={itemClass}>
          {allLabel}
        </ToggleGroupItem>
      )}
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className={itemClass}>
          {/* A long label (folder name) ends with «…» instead of pushing the rest of the row down. */}
          <span className="max-w-[24ch] truncate" title={o.label}>
            {o.label}
          </span>
          {o.count !== undefined && <span className="shrink-0 tabular-nums opacity-55">{o.count}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * The filter row of a list page, always in the same order: chips on the left (wrap if needed), then on the
 * right `trailing` — TagFilter and SearchInput (w-72); `secondary` goes on a second line. «/» finds the
 * search in the same place on every screen.
 */
export function FilterBar({
  chips,
  trailing,
  secondary,
  className
}: {
  chips?: ReactNode
  trailing?: ReactNode
  secondary?: ReactNode
  className?: string
}): ReactElement {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {chips && <div className="flex min-w-0 flex-wrap items-center gap-2">{chips}</div>}
        {trailing && <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div>}
      </div>
      {secondary}
    </div>
  )
}

/** Segmented control (shadcn ToggleGroup, variant "segment"): exactly one option is always selected. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'sm'
}: {
  options: { value: T; label: ReactNode; title?: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'xs' | 'default'
}) {
  return (
    <ToggleGroup
      type="single"
      variant="segment"
      size={size}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={className}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} title={o.title} aria-label={o.title}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Segmented progress (reference "Active order" bar) built from shadcn Progress segments. */
export function SegmentBar({
  value,
  total,
  segments = 4,
  className,
  tone = 'lime',
  states
}: {
  value: number
  total: number
  segments?: number
  className?: string
  tone?: 'lime' | 'ink'
  /** Checklists (≤ 12 items): one segment per item, filled exactly where that item is done. */
  states?: boolean[]
}) {
  const ratio = total ? Math.min(1, value / total) : 0
  const perItem = states && states.length > 0 && states.length <= 12
  const count = perItem ? states.length : segments
  // Whole segments only: a fractional fill left a lime sliver at the start of the next segment.
  // Any progress shows at least one segment; it's full only when everything is done.
  const filled = value <= 0 ? 0 : ratio >= 1 ? count : Math.min(count - 1, Math.max(1, Math.round(ratio * count)))
  return (
    <div className={cn('flex gap-1', className)} role="progressbar" aria-valuenow={value} aria-valuemax={total}>
      {Array.from({ length: count }, (_, i) => {
        const on = perItem ? !!states[i] : i < filled
        return (
          <Progress
            key={i}
            value={on ? 100 : 0}
            aria-hidden
            className={cn(
              'h-1.5 flex-1 bg-current/15',
              tone === 'lime'
                ? '[&>[data-slot=progress-indicator]]:bg-chart-1'
                : '[&>[data-slot=progress-indicator]]:bg-lime-foreground',
              // An empty segment hides its indicator: anti-aliasing showed a hairline of colour at the edge.
              !on && '[&>[data-slot=progress-indicator]]:opacity-0'
            )}
          />
        )
      })}
    </div>
  )
}

/** Labelled form field (shadcn Field + FieldLabel). */
export function Field({
  label,
  children,
  className,
  htmlFor,
  error,
  hint,
  count
}: {
  label: string
  children: ReactNode
  className?: string
  htmlFor?: string
  /** Shown under the control in the destructive colour; the label stays the same. */
  error?: ReactNode
  /** Quiet explanation under the control (hidden while there is an error). */
  hint?: ReactNode
  /** Character counter: appears next to the label once 80% of the limit is used. */
  count?: { length: number; max?: number }
}) {
  // View mode shows values, not validation: an error appears only while editing.
  const viewMode = useReadOnly()
  // A control without an id to point at still gets a name: the group is labelled instead. With htmlFor the
  // control itself is labelled, and naming the group too would give two elements the same label.
  const labelId = useId()
  if (viewMode) error = undefined
  const near = count?.max ? count.length >= count.max * 0.8 : false
  return (
    <UiField
      className={cn('min-w-0 gap-2', className)}
      data-invalid={error ? true : undefined}
      aria-labelledby={htmlFor ? undefined : labelId}
    >
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel id={labelId} htmlFor={htmlFor}>
          {label}
        </FieldLabel>
        {near && count?.max && (
          <span
            className={cn('text-meta tabular-nums', count.length >= count.max ? 'text-warn' : 'text-muted-foreground')}
            aria-live="polite"
          >
            {count.length} / {count.max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <FieldError className="text-caption">{error}</FieldError>
      ) : (
        hint && <FieldDescription className="text-caption">{hint}</FieldDescription>
      )}
    </UiField>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <UiKbd className={className}>{children}</UiKbd>
}
