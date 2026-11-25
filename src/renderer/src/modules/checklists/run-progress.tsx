import type { ReactElement } from 'react'
import type { ChecklistItem } from '@shared/domain/checklists'
import { fmtPercent } from '@/lib/format'
import { SegmentBar } from '@/components/common/page'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/** Up to this many items the bar has one segment per item (docs/design-system.md → Прогресс). */
export const PER_ITEM_MAX = 12

/** Progress of a run: big count, a bar and «Готово X з Y». Lime only once everything is ticked. */
export function RunProgress({ items }: { items: ChecklistItem[] }): ReactElement {
  const total = items.length
  const done = items.filter((i) => i.done).length
  const complete = total > 0 && done === total
  return (
    <Card className={cn('mt-5 flex-row items-center gap-5 p-5', complete && 'bg-lime text-lime-foreground')}>
      <span className="font-display text-title leading-none tabular-nums">
        {done}
        <span className="opacity-50">/{total}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {total > 0 &&
          (total <= PER_ITEM_MAX ? (
            <SegmentBar value={done} total={total} states={items.map((i) => i.done)} tone={complete ? 'ink' : 'lime'} />
          ) : (
            <Progress value={(done / total) * 100} className="h-1.5" />
          ))}
        <span className={cn('min-w-0 truncate text-meta', complete ? 'opacity-75' : 'text-muted-foreground')}>
          {total ? `Готово ${done} з ${total} · ${fmtPercent((done / total) * 100)}` : 'Поки без пунктів'}
        </span>
      </div>
    </Card>
  )
}
