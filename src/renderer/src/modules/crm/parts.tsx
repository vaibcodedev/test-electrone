import { useId, type ReactElement, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { BILLING_TYPES, type BillingType } from '@shared/domain/crm'
import { Confirm } from '@/components/common/confirm'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { BILLING_HINT, BILLING_LABEL } from './labels'

interface ChoiceOption<T extends string> {
  value: T
  label: string
}

/**
 * shadcn Select with the standard field look (border + tint from ui/select, docs/design-system.md → Формы).
 * `none` adds an empty option; `id` ties it to a Field label.
 */
export function Choice<T extends string>({
  id,
  value,
  onChange,
  options,
  placeholder,
  className,
  none,
  size = 'default'
}: {
  id?: string
  value: T | null | undefined
  onChange: (value: T | null) => void
  options: ChoiceOption<T>[]
  placeholder?: string
  className?: string
  none?: string
  size?: 'default' | 'sm'
}): ReactElement {
  const NONE = '__none__'
  const readOnly = useReadOnly()
  return (
    <Select
      value={value ?? (none ? NONE : undefined)}
      onValueChange={(v) => onChange(v === NONE ? null : (v as T))}
    >
      {/* Reading: the empty option («Без платформи») is no data — data-empty hides the whole Field. */}
      <SelectTrigger
        id={id}
        size={size}
        data-empty={readOnly && value == null && none ? '' : undefined}
        className={cn('w-full text-body', className)}
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

/**
 * «У кошик» in a record header: icon button with a tooltip behind a confirmation. The tooltip trigger sits
 * inside Confirm's trigger so both get the same button (icon-sm, like the header's other buttons).
 */
export function TrashButton({
  title,
  description,
  onConfirm
}: {
  title: string
  description: string
  onConfirm: () => void
}): ReactElement {
  return (
    <Tooltip>
      <Confirm title={title} description={description} onConfirm={onConfirm}>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="У кошик">
            <Trash2 />
          </Button>
        </TooltipTrigger>
      </Confirm>
      <TooltipContent>У кошик</TooltipContent>
    </Tooltip>
  )
}

/**
 * A phrase in place of an empty stat value («ще немає оплат»): a zero would read as data
 * (docs/design-system.md → Плитка статистики). Resets the stat's display font and size.
 */
export function EmptyValue({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <span
      className={cn(
        'font-sans text-body font-normal tracking-normal text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  )
}

/** Section block on detail pages. */
export function Section({
  title,
  hint,
  action,
  children
}: {
  title: string
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
}): ReactElement {
  return (
    <section className="flex flex-col gap-3">
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

/** Record view: a definition list of label → value rows; empty values are skipped by the caller. */
export function InfoList({ children }: { children: ReactNode }): ReactElement {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-body">
      {children}
    </dl>
  )
}

export function InfoRow({
  label,
  children,
  actions
}: {
  label: string
  children: ReactNode
  actions?: ReactNode
}): ReactElement {
  return (
    <>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className="selectable min-w-0 truncate">{children}</span>
        {actions && <span className="ml-auto flex shrink-0 items-center">{actions}</span>}
      </dd>
    </>
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
}): ReactElement {
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

/**
 * Billing type as a vertical radio list (shadcn RadioGroup + Label): one compact row per option —
 * radio, label (nowrap), one-line muted hint. Selected row is a neutral raised surface, not a coloured
 * card, so it reads the same in narrow asides and in dialogs (docs/design-system.md → Формы).
 */
export function BillingPicker({
  value,
  onChange,
  className
}: {
  value: BillingType
  onChange: (value: BillingType) => void
  className?: string
}): ReactElement {
  const idPrefix = useId()
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
          {/* dark: variant too — ui/radio-group sets dark:bg-input/30, which a plain checked bg doesn't beat. */}
          <RadioGroupItem
            value={b}
            id={`${idPrefix}-${b}`}
            className="data-[state=checked]:border-transparent data-[state=checked]:bg-lime dark:data-[state=checked]:bg-lime [&_svg]:fill-lime-foreground [&_svg]:stroke-none"
          />
          <span className="shrink-0 text-body font-medium whitespace-nowrap text-foreground">
            {BILLING_LABEL[b]}
          </span>
          <span
            className="min-w-0 truncate text-caption text-muted-foreground"
            title={BILLING_HINT[b]}
          >
            {BILLING_HINT[b]}
          </span>
        </Label>
      ))}
    </RadioGroup>
  )
}
