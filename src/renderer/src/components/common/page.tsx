/**
 * Page-level building blocks. Everything here is a thin composition of shadcn components
 * (Empty, InputGroup, ToggleGroup, Progress, Field, Kbd) — no hand-made controls.
 */
import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Progress } from '@/components/ui/progress'
import { Field as UiField, FieldLabel } from '@/components/ui/field'
import { Kbd as UiKbd } from '@/components/ui/kbd'

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

/** Empty state (shadcn Empty): says what to do next, with the action right there. */
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
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

/** Search field (shadcn InputGroup) with clear button and Esc to clear. */
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
    <InputGroup className={cn('h-9', className)}>
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
          <InputGroupButton size="icon-xs" className="rounded-full" aria-label="Очистить" onClick={() => onChange('')}>
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

/** Pill filter chips (shadcn ToggleGroup, variant "chip": selected = lime). `allLabel` adds a "show all" chip. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  allLabel,
  className,
  size = 'sm'
}: {
  options: ChipOption<T>[]
  value: T | undefined
  onChange: (value: T | undefined) => void
  allLabel?: string
  className?: string
  size?: 'sm' | 'xs' | 'default'
}) {
  return (
    <ToggleGroup
      type="single"
      variant="chip"
      size={size}
      value={value ?? (allLabel ? ALL : '')}
      onValueChange={(v) => {
        if (!v) return allLabel ? onChange(undefined) : onChange(undefined)
        onChange(v === ALL ? undefined : (v as T))
      }}
      className={className}
    >
      {allLabel && <ToggleGroupItem value={ALL}>{allLabel}</ToggleGroupItem>}
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value}>
          {o.label}
          {o.count !== undefined && <span className="tabular-nums opacity-55">{o.count}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
      {Array.from({ length: segments }, (_, i) => (
        <Progress
          key={i}
          value={Math.max(0, Math.min(1, ratio * segments - i)) * 100}
          aria-hidden
          className={cn(
            'h-1.5 flex-1 bg-current/15',
            tone === 'lime'
              ? '[&>[data-slot=progress-indicator]]:bg-lime'
              : '[&>[data-slot=progress-indicator]]:bg-lime-foreground'
          )}
        />
      ))}
    </div>
  )
}

/** Labelled form field (shadcn Field + FieldLabel). */
export function Field({
  label,
  children,
  className,
  htmlFor
}: {
  label: string
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <UiField className={cn('gap-2', className)}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
    </UiField>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <UiKbd className={className}>{children}</UiKbd>
}
