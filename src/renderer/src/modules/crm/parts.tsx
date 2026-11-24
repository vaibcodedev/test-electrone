import type { ReactNode } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface ChoiceOption<T extends string> {
  value: T
  label: string
}

/** Select styled like the rest of the inputs (soft surface, rounded). `none` adds an empty option. */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  none
}: {
  value: T | null | undefined
  onChange: (value: T | null) => void
  options: ChoiceOption<T>[]
  placeholder?: string
  className?: string
  none?: string
}) {
  const NONE = '__none__'
  return (
    <Select
      value={value ?? (none ? NONE : undefined)}
      onValueChange={(v) => onChange(v === NONE ? null : (v as T))}
    >
      <SelectTrigger
        className={cn(
          'h-9 w-full rounded-xl border-transparent bg-surface text-[13px] shadow-none dark:bg-surface',
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

/** Dashboard-style stat tile. */
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
    <section
      className={cn(
        'flex min-h-[118px] flex-col justify-between rounded-3xl p-5',
        tone === 'ink' && 'bg-ink text-ink-foreground',
        tone === 'lime' && 'bg-lime text-lime-foreground',
        tone === 'surface' && 'bg-surface',
        className
      )}
    >
      <span
        className={cn(
          'text-[12.5px]',
          tone === 'ink'
            ? 'text-ink-muted'
            : tone === 'lime'
              ? 'opacity-70'
              : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
      <div>
        <div className="font-display text-[30px] leading-none tabular-nums">{value}</div>
        {hint && (
          <div
            className={cn(
              'mt-1.5 text-[12px]',
              tone === 'surface' ? 'text-muted-foreground' : 'opacity-70'
            )}
          >
            {hint}
          </div>
        )}
      </div>
    </section>
  )
}

/** Section block on detail pages. */
export function Section({
  title,
  action,
  children,
  className
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[20px]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Thin progress bar (hours vs budget). Turns warn when over budget. */
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
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-foreground/10', className)}>
      <div
        className={cn('h-full rounded-full', ratio > 1 ? 'bg-warn' : 'bg-lime')}
        style={{ width: `${Math.min(100, ratio * 100)}%` }}
      />
    </div>
  )
}
