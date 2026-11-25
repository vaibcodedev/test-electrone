/**
 * Page-level building blocks. Everything here is a thin composition of shadcn components
 * (Empty, InputGroup, ToggleGroup, Progress, Field, Kbd) — no hand-made controls.
 */
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { RotateCcw, Search, SearchX, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtNumber } from '@/lib/format'
import { useReadOnly } from './detail-mode'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Progress } from '@/components/ui/progress'
import { Field as UiField, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { FieldControlProvider } from '@/components/ui/field-control'
import { Kbd as UiKbd } from '@/components/ui/kbd'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
    // shrink-0: in a short window the Page column must not squeeze the header (the filters drew over the list).
    <header
      data-slot="page-header"
      className={cn('flex shrink-0 flex-col gap-4 px-8 pt-7 pb-5', className)}
    >
      {/* min-h-10: as tall without actions (/trash) as with them, so the subtitle does not jump between pages. */}
      <div className="flex min-h-10 items-start justify-between gap-6">
        {/* tabIndex -1: a page may move focus here (after emptying the trash); never a Tab stop. */}
        <h1
          tabIndex={-1}
          className="font-display text-title max-w-[18ch] min-w-0 text-balance outline-none"
        >
          {title}
        </h1>
        {actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
      </div>
      {/* Under the title row, not beside the actions: four header buttons no longer squeeze it onto two
          lines. -mt-2 keeps the 8px from the title; 110ch keeps a two-clause subtitle on one line at 1440. */}
      {subtitle && (
        <div className="-mt-2 max-w-[110ch] text-pretty text-body text-muted-foreground">
          {subtitle}
        </div>
      )}
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
 * action — a soft button (the lime one stays in the page header: one accent per screen); `variant: 'lime'`
 * only on a screen whose header has no lime button (focus screen, empty moodboard). `action` is for
 * anything else, e.g. a `subtle` button when the empty state sits inside a surface card. `cta.iconEnd` — an
 * icon after the label: the arrow of a move to another screen («До вакансій →», docs/design-system.md → Кнопки).
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
  cta?: {
    label: string
    icon?: LucideIcon
    iconEnd?: LucideIcon
    onClick: () => void
    disabled?: boolean
    variant?: 'soft' | 'lime'
  }
  className?: string
}) {
  const CtaIcon = cta?.icon
  const CtaIconEnd = cta?.iconEnd
  return (
    <Empty className={cn('py-14', className)}>
      <EmptyHeader>
        {Icon && (
          // A tint, not bg-surface: the circle stays visible on card and inside a surface card alike.
          <EmptyMedia variant="icon" className="size-14 rounded-full bg-foreground/7">
            <Icon className="size-6 text-muted-foreground" />
          </EmptyMedia>
        )}
        <EmptyTitle className="text-lead font-medium">{title}</EmptyTitle>
        {hint && <EmptyDescription className="text-body">{hint}</EmptyDescription>}
      </EmptyHeader>
      {(action || cta) && (
        <EmptyContent>
          {cta && (
            <Button variant={cta.variant ?? 'soft'} disabled={cta.disabled} onClick={cta.onClick}>
              {CtaIcon && <CtaIcon />}
              {cta.label}
              {CtaIconEnd && <CtaIconEnd />}
            </Button>
          )}
          {action}
        </EmptyContent>
      )}
    </Empty>
  )
}

/** Empty result of filters or search: one pattern on every list (docs/design-system.md → Пустые состояния). */
export function NoResults({
  icon,
  hint,
  onReset,
  className
}: {
  icon?: LucideIcon
  /** Built from the conditions that are really active. */
  hint?: ReactNode
  onReset: () => void
  className?: string
}): ReactElement {
  return (
    <EmptyState
      icon={icon ?? SearchX}
      title="Нічого не знайдено"
      hint={hint}
      cta={{ label: 'Скинути фільтри', icon: RotateCcw, onClick: onReset }}
      className={className}
    />
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
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    // Same height as chips and sm buttons in the filter row and one width on every screen
    // (docs/design-system.md → Ряд фильтров); shrinks instead of overflowing a narrow row.
    <InputGroup className={cn('h-8 w-72 max-w-full shrink', className)}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        data-page-search
        // searchbox, not type="search": Chromium would draw its own ✕ next to ours.
        role="searchbox"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // The placeholder disappears while typing; the field keeps its name.
        aria-label={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation()
            onChange('')
          }
        }}
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <InputGroupButton
                size="icon-xs"
                className="rounded-full"
                aria-label="Очистити пошук"
                // The ✕ goes away with the text: focus returns to the field instead of falling to body.
                onClick={() => {
                  onChange('')
                  inputRef.current?.focus()
                }}
              >
                <X />
              </InputGroupButton>
            </TooltipTrigger>
            <TooltipContent>Очистити · Esc</TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

export interface ChipOption<T extends string> {
  value: T
  label: string
  count?: number
  /** Colour class of a dot before the label (`bg-chart-2`): the legend of the same dots in the rows. */
  dot?: string
}

const ALL = '__all__'

/**
 * Selected chip of a secondary filter group: a neutral tint, so the screen keeps one lime filter group. Exported
 * for chip groups that are not FilterChips (the type switch of quick add).
 */
export const NEUTRAL_CHIP =
  'on:bg-foreground/12 on:text-foreground on:font-medium on:focus-visible:ring-ring'

/**
 * Pill filter chips (shadcn ToggleGroup, variant "chip": selected = lime). `allLabel` adds a "show all" chip.
 * `tone="neutral"` — the second and further groups of a filter row (docs/design-system.md → Переключатели).
 * A chip with `count: 0` is hidden unless it is selected, and a row with nothing to pick is not drawn at all:
 * no «Djinni 0 · DOU 0» above an empty state, and no «Усі» + one chip that would show the same records
 * (docs/design-system.md → Ряд фильтров). A selected chip always stays, so the filter can be turned off.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  allLabel,
  className,
  size = 'sm',
  tone = 'accent',
  label
}: {
  options: ChipOption<T>[]
  value: T | undefined
  onChange: (value: T | undefined) => void
  allLabel?: string
  className?: string
  size?: 'sm' | 'xs' | 'default'
  tone?: 'accent' | 'neutral'
  /** Name of the group for screen readers («Майданчик», «Стадія»). */
  label?: string
}) {
  const itemClass = tone === 'neutral' ? NEUTRAL_CHIP : undefined
  const visible = options.filter((o) => o.count === undefined || o.count > 0 || o.value === value)
  if (value === undefined && visible.length < (allLabel ? 2 : 1)) return null
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
      aria-label={label}
    >
      {allLabel && (
        <ToggleGroupItem value={ALL} className={itemClass}>
          {allLabel}
        </ToggleGroupItem>
      )}
      {visible.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className={itemClass}>
          {o.dot && <span aria-hidden className={cn('size-2 shrink-0 rounded-full', o.dot)} />}
          {/* A long label (folder name) ends with «…» instead of pushing the rest of the row down. */}
          <span className="max-w-[24ch] truncate" title={o.label}>
            {o.label}
          </span>
          {/* muted, not opacity-55: a faded count fell below 4.5:1 in the light theme. */}
          {o.count !== undefined && (
            <span className="shrink-0 tabular-nums text-muted-foreground in-data-[state=on]:text-current in-data-[state=on]:opacity-70">
              {o.count}
            </span>
          )}
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
      {/* The row itself does not wrap: chips wrap in their own column, the search stays right on the first line. */}
      <div className="flex items-start gap-2">
        {chips && (
          <div className="flex min-w-0 flex-1 basis-0 flex-wrap items-center gap-2">{chips}</div>
        )}
        {trailing && (
          <div className="ml-auto flex min-w-0 shrink items-center gap-2">{trailing}</div>
        )}
      </div>
      {secondary}
    </div>
  )
}

/**
 * Segmented control (shadcn ToggleGroup, variant "segment"): exactly one option is always selected. `count` —
 * a muted number after the label («Клієнти 12»); leave it out while the number would mislead (more pages).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'sm'
}: {
  options: { value: T; label: ReactNode; title?: string; count?: number }[]
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
      {options.map((o) => {
        const item = (
          <ToggleGroupItem key={o.value} value={o.value} aria-label={o.title}>
            {o.label}
            {o.count !== undefined && (
              <span className="tabular-nums text-muted-foreground">{o.count}</span>
            )}
          </ToggleGroupItem>
        )
        // An icon-only segment explains itself in a Tooltip, like every icon button (docs/design-system.md → Кнопки).
        return o.title ? (
          <Tooltip key={o.value}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent>{o.title}</TooltipContent>
          </Tooltip>
        ) : (
          item
        )
      })}
    </ToggleGroup>
  )
}

/** Up to this many items a bar draws a segment per item; a longer list gets one bar (docs/design-system.md → Прогресс). */
export const SEGMENTS_MAX = 12

const SEGMENT_FILL = {
  lime: '*:data-[slot=progress-indicator]:bg-chart-1',
  ink: '*:data-[slot=progress-indicator]:bg-lime-foreground',
  'on-ink': '*:data-[slot=progress-indicator]:bg-ink-accent'
} as const

/** Segmented progress (reference "Active order" bar) built from shadcn Progress segments. */
export function SegmentBar({
  value,
  total,
  segments = 4,
  className,
  tone = 'lime',
  states,
  label
}: {
  value: number
  total: number
  segments?: number
  className?: string
  /**
   * `lime` — on paper; `ink` — dark segments on the lime sidebar card (lime-foreground is the ink colour, so it
   * vanishes on an ink tile); `on-ink` — accent segments on an ink tile.
   */
  tone?: 'lime' | 'ink' | 'on-ink'
  /** Checklists (≤ 12 items): one segment per item, filled exactly where that item is done. More — one bar. */
  states?: boolean[]
  /** Name of the bar for screen readers («Готово 3 з 5»). */
  label?: string
}) {
  const ratio = total ? Math.min(1, value / total) : 0
  const fill = SEGMENT_FILL[tone]
  if (states && states.length > SEGMENTS_MAX) {
    return (
      <Progress
        value={ratio * 100}
        aria-label={label}
        className={cn('h-1.5 bg-current/15', fill, className)}
      />
    )
  }
  const perItem = !!states?.length
  const count = perItem ? states.length : segments
  // Whole segments only: a fractional fill left a lime sliver at the start of the next segment.
  // Any progress shows at least one segment; it's full only when everything is done.
  const filled =
    value <= 0
      ? 0
      : ratio >= 1
        ? count
        : Math.min(count - 1, Math.max(1, Math.round(ratio * count)))
  return (
    <div
      className={cn('flex gap-1', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuenow={value}
      aria-valuemax={total}
    >
      {Array.from({ length: count }, (_, i) => {
        const on = perItem ? !!states[i] : i < filled
        return (
          <Progress
            key={i}
            value={on ? 100 : 0}
            aria-hidden
            className={cn(
              'h-1.5 flex-1 bg-current/15',
              fill,
              // An empty segment hides its indicator: anti-aliasing showed a hairline of colour at the edge.
              !on && '*:data-[slot=progress-indicator]:opacity-0'
            )}
          />
        )
      })}
    </div>
  )
}

/**
 * Character counter of a long field (docs/design-system.md → Формы): appears after 80% of the limit and
 * turns warn from 90%. Field and MarkdownField share it, so both behave the same. It is announced only from
 * 90%: a live counter from 80% made a screen reader read a number after every key.
 */
export function CharCount({
  length,
  max,
  className
}: {
  length: number
  max?: number
  className?: string
}): ReactElement | null {
  if (!max) return null
  const near = length >= max * 0.8
  const warn = length >= max * 0.9
  return (
    <span
      className={cn(
        'shrink-0 text-meta tabular-nums',
        warn ? 'text-warn' : 'text-muted-foreground',
        // The limit is visible while you type in the field, and always once it gets close.
        !near && 'invisible group-focus-within/field:visible',
        className
      )}
      aria-live={warn ? 'polite' : undefined}
    >
      {fmtNumber(length)} / {fmtNumber(max)}
    </span>
  )
}

/**
 * Labelled form field (shadcn Field + FieldLabel). With `htmlFor` the message under the control has an id the
 * control can point at with `aria-describedby`: `${htmlFor}-error` for the error, `${htmlFor}-hint` for the hint.
 */
export function Field({
  label,
  children,
  className,
  htmlFor,
  error: errorProp,
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
  /**
   * Character counter next to the label. Usually not needed: an Input / Textarea with maxLength whose id is
   * `htmlFor` reports its length itself (FieldControl). Shown while the field has focus and from 80% of the limit.
   */
  count?: { length: number; max?: number }
}) {
  // View mode shows values, not validation: an error appears only while editing.
  const viewMode = useReadOnly()
  // A control without an id to point at still gets a name: the group is labelled instead. With htmlFor the
  // control itself is labelled, and naming the group too would give two elements the same label.
  const labelId = useId()
  // In view mode the control is text without that id (LinkInput, NumberInput): the label names the group.
  const forId = viewMode ? undefined : htmlFor
  const error = viewMode ? undefined : errorProp
  // The control's own report of its length (useFieldCount), so every limited field shows its limit.
  const [reported, setReported] = useState<{ length: number; max: number } | null>(null)
  const report = useCallback((length: number, max: number) => {
    setReported((p) => (p && p.length === length && p.max === max ? p : { length, max }))
  }, [])
  const describedBy = forId && (error ? `${forId}-error` : hint ? `${forId}-hint` : undefined)
  const control = useMemo(
    () => ({ id: forId, describedBy, invalid: !!error, count: report }),
    [forId, describedBy, error, report]
  )
  const shown = count ?? reported
  return (
    <UiField
      className={cn('min-w-0 gap-2', className)}
      data-invalid={error ? true : undefined}
      aria-labelledby={forId ? undefined : labelId}
    >
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel id={labelId} htmlFor={forId}>
          {label}
        </FieldLabel>
        {shown && !viewMode && <CharCount length={shown.length} max={shown.max} />}
      </div>
      <FieldControlProvider value={control}>{children}</FieldControlProvider>
      {error ? (
        <FieldError id={forId && `${forId}-error`} className="text-caption">
          {error}
        </FieldError>
      ) : (
        hint && (
          <FieldDescription id={forId && `${forId}-hint`} className="text-caption">
            {hint}
          </FieldDescription>
        )
      )}
    </UiField>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <UiKbd className={className}>{children}</UiKbd>
}
