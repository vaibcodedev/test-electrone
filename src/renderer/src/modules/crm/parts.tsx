import type { ReactNode } from 'react'
import { BILLING_TYPES, type BillingType } from '@shared/domain/crm'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { BILLING_INFO } from './labels'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
}

/** shadcn Select styled like the rest of the inputs. `none` adds an empty option. */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  none,
  size = 'default'
}: {
  value: T | null | undefined
  onChange: (value: T | null) => void
  options: ChoiceOption<T>[]
  placeholder?: string
  className?: string
  none?: string
  size?: 'default' | 'sm'
}) {
  const NONE = '__none__'
  return (
    <Select
      value={value ?? (none ? NONE : undefined)}
      onValueChange={(v) => onChange(v === NONE ? null : (v as T))}
    >
      <SelectTrigger
        size={size}
        className={cn(
          'w-full rounded-xl border-transparent bg-surface text-body shadow-none dark:bg-surface',
          className
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        {none && <SelectItem value={NONE}>{none}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Dashboard-style stat tile (shadcn Card). */
export function StatTile({
  label,
  value,
  hint,
  tone = 'surface',
  className
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'surface' | 'ink' | 'lime'
  className?: string
}) {
  return (
    <Card
      className={cn(
        'min-h-[118px] justify-between gap-2',
        tone === 'ink' && 'bg-ink text-ink-foreground',
        tone === 'lime' && 'bg-lime text-lime-foreground',
        className
      )}
    >
      <CardHeader>
        <CardDescription
          className={cn(
            'text-caption',
            tone === 'ink' ? 'text-ink-muted' : tone === 'lime' && 'text-lime-foreground/70'
          )}
        >
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="font-display text-headline leading-none tabular-nums">{value}</div>
        {hint && (
          <div
            className={cn(
              'mt-1.5 text-caption',
              tone === 'surface'
                ? 'text-muted-foreground'
                : tone === 'ink'
                  ? 'text-ink-muted'
                  : 'opacity-70'
            )}
          >
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Section block on detail pages. */
export function Section({
  title,
  hint,
  action,
  children,
  className
}: {
  title: string
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-heading">{title}</h2>
          {hint && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Thin progress bar (shadcn Progress). Turns warn when over the limit. */
export function Meter({
  value,
  max,
  className
}: {
  value: number
  max: number
  className?: string
}) {
  const ratio = max > 0 ? value / max : 0
  return (
    <Progress
      value={Math.min(100, ratio * 100)}
      className={cn(
        'h-1.5 bg-foreground/10',
        ratio > 1
          ? '[&>[data-slot=progress-indicator]]:bg-warn'
          : '[&>[data-slot=progress-indicator]]:bg-chart-1',
        className
      )}
    />
  )
}

/** Billing type chosen first: shadcn RadioGroup of choice cards. */
/** One-line hint per billing type: short enough to never wrap next to the label. */
const BILLING_HINT: Record<BillingType, string> = {
  fixed: 'оплата за весь проєкт',
  hourly: 'ставка за годину',
  retainer: 'щомісячна сума',
  none: 'без грошей'
}

/**
 * Billing type as a vertical radio list (shadcn RadioGroup + Label): one compact row per option —
 * radio, label (nowrap), one-line muted hint. Selected row is a neutral raised surface, not a coloured
 * card, so it reads the same in narrow asides and in dialogs (docs/design-system.md → Формы).
 */
export function BillingPicker({
  value,
  onChange,
  compact,
  className
}: {
  value: BillingType
  onChange: (value: BillingType) => void
  compact?: boolean
  className?: string
}) {
  const idPrefix = `billing-${compact ? 'c' : 'f'}`
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as BillingType)}
      className={cn('flex flex-col gap-1', className)}
    >
      {BILLING_TYPES.map((b) => (
        <Label
          key={b}
          htmlFor={`${idPrefix}-${b}`}
          className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 font-normal transition-colors hover:bg-foreground/5 has-data-[state=checked]:bg-card has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-foreground/15"
        >
          <RadioGroupItem
            value={b}
            id={`${idPrefix}-${b}`}
            className="data-[state=checked]:border-transparent data-[state=checked]:bg-lime [&_svg]:fill-lime-foreground [&_svg]:stroke-none"
          />
          <span className="shrink-0 text-body font-medium whitespace-nowrap text-foreground">
            {BILLING_INFO[b].title}
          </span>
          <span className="min-w-0 truncate text-caption text-muted-foreground">
            {BILLING_HINT[b]}
          </span>
        </Label>
      ))}
    </RadioGroup>
  )
}
