import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import { SegmentBar } from './page'

/** Up to this many steps the bar is one segment per step (docs/design-system.md → Прогресс). */
const PER_ITEM_MAX = 12

/**
 * Progress with its caption: a bar and «Готово X з Y» under it, an optional warning on the right
 * («переплата 300 $»). Short lists (≤ 12) or explicit `states` get one segment per item, longer ones a
 * single bar. The bar never shows more than 100%: the excess goes into `warn` as words.
 */
export function ProgressLine({
  value,
  total,
  states,
  label,
  warn,
  tone = 'lime',
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
  className?: string
}): ReactElement {
  const segmented = !!states?.length || (total > 0 && total <= PER_ITEM_MAX)
  const percent = total > 0 ? Math.min(100, (value / total) * 100) : 0
  const caption = label ?? `Готово ${value} з ${total}`
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {segmented ? (
        <SegmentBar
          value={value}
          total={total}
          segments={states?.length || total}
          states={states}
          tone={tone}
        />
      ) : (
        <Progress
          value={percent}
          aria-label={caption}
          className={cn(
            'h-1.5 bg-current/15',
            tone === 'lime'
              ? '[&>[data-slot=progress-indicator]]:bg-chart-1'
              : '[&>[data-slot=progress-indicator]]:bg-lime-foreground'
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
