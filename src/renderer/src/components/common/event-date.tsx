import type { ReactElement, ReactNode } from 'react'
import { format } from 'date-fns'
import { fmtDay } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Date block of an «event with a date» row (docs/design-system.md → Списки): «завтра» on top, the time
 * below. `withTime={false}` for a deadline without a set hour. Inside a surface tile pass `className="bg-card"`.
 * `label` replaces the day line (the agenda shows a weekday), `title` — the full date on hover.
 */
export function EventDate({
  when,
  withTime = true,
  label,
  title,
  className
}: {
  when: number | null
  withTime?: boolean
  label?: ReactNode
  title?: string
  className?: string
}): ReactElement {
  return (
    <span
      title={title}
      className={cn(
        'flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 self-stretch rounded-xl bg-surface py-1.5 text-center',
        className
      )}
    >
      <span className="text-meta leading-none text-muted-foreground">
        {label ?? (when ? fmtDay(when) : 'без дати')}
      </span>
      {when && withTime && (
        <span className="text-lead leading-tight font-semibold tabular-nums">
          {format(when, 'HH:mm')}
        </span>
      )}
    </span>
  )
}
