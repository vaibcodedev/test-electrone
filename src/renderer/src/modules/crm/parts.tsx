import { useId, type ReactElement, type ReactNode } from 'react'
import { BILLING_TYPES, type BillingType } from '@shared/domain/crm'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { BILLING_HINT, BILLING_LABEL } from './labels'

/** Moved to components/common; re-exported for the freelance module, which still imports it from here. */
export { EmptyValue } from '@/components/common/empty-value'

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

/** Thin progress bar (shadcn Progress). Turns warn when over the limit; `label` names it for screen readers. */
export function Meter({
  value,
  max,
  label,
  className
}: {
  value: number
  max: number
  label: string
  className?: string
}): ReactElement {
  const ratio = max > 0 ? value / max : 0
  return (
    <Progress
      value={Math.min(100, ratio * 100)}
      aria-label={label}
      className={cn(
        'h-1.5 bg-foreground/10',
        ratio > 1
          ? '*:data-[slot=progress-indicator]:bg-warn-fill'
          : '*:data-[slot=progress-indicator]:bg-chart-1',
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
          <RadioGroupItem
            value={b}
            id={`${idPrefix}-${b}`}
            className="data-[state=checked]:border-transparent data-[state=checked]:bg-lime [&_svg]:fill-lime-foreground [&_svg]:stroke-none"
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
