import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'
import { fmtNumber } from '@/lib/format'
import { Progress } from '@/components/ui/progress'
import { SEGMENTS_MAX, SegmentBar } from './page'

/**
 * Progress with its caption: a bar and «Готово X з Y» under it, an optional warning on the right
 * («переплата 300 $»). Short lists (≤ 12 whole steps) or `states` up to 12 get one segment per item, longer
 * ones and `continuous` amounts a single bar. The bar never shows more than 100%: the excess goes into `warn`.
 */
export function ProgressLine({
  value,
  total,
  states,
  label,
  warn,
  tone = 'lime',
  continuous,
  className
}: {
  value: number
  total: number
  /** Checklists: done / not done per item, the segment is filled exactly where the item is done. */
  states?: boolean[]
  /** Replaces «Готово X з Y» (e.g. «Оплачено 3 з 5 етапів»). */
  label?: string
  warn?: string
  /** `ink` — on an ink tile. */
  tone?: 'lime' | 'ink'
  /** An amount, not a count of steps (hours, money): always one bar, a 10 h budget is not 10 segments. */
  continuous?: boolean
  className?: string
}): ReactElement {
  const segmented = states?.length
    ? states.length <= SEGMENTS_MAX
    : !continuous && Number.isInteger(total) && total > 0 && total <= SEGMENTS_MAX
  const percent = total > 0 ? Math.min(100, (value / total) * 100) : 0
  const caption = label ?? `Готово ${fmtNumber(value)} з ${fmtNumber(total)}`
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {segmented ? (
        <SegmentBar
          value={value}
          total={total}
          segments={states?.length || total}
          states={states}
          tone={tone === 'ink' ? 'on-ink' : 'lime'}
          label={caption}
        />
      ) : (
        <Progress
          value={percent}
          aria-label={caption}
          className={cn(
            'h-1.5 bg-current/15',
            tone === 'lime'
              ? '[&>[data-slot=progress-indicator]]:bg-chart-1'
              : '[&>[data-slot=progress-indicator]]:bg-ink-accent'
          )}
        />
      )}
      <div className="flex justify-between gap-3 text-caption tabular-nums">
        <span
          className={cn(
            'min-w-0 truncate',
            tone === 'ink' ? 'text-ink-muted' : 'text-muted-foreground'
          )}
        >
          {caption}
        </span>
        {warn && (
          <span className={cn('shrink-0', tone === 'ink' ? 'text-ink-foreground' : 'text-warn')}>
            {warn}
          </span>
        )}
      </div>
    </div>
  )
}
