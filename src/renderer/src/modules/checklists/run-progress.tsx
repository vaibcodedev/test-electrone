import type { ReactElement } from 'react'
import type { ChecklistItem } from '@shared/domain/checklists'
import { SegmentBar } from '@/components/common/page'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Progress of a run: big count, a bar and «Готово X з Y». Lime only once everything is ticked. */
export function RunProgress({ items }: { items: ChecklistItem[] }): ReactElement {
  const total = items.length
  const done = items.filter((i) => i.done).length
  const complete = total > 0 && done === total
  const caption = total ? `Готово ${done} з ${total}` : 'Поки без пунктів'
  return (
    <Card
      className={cn(
        'mt-5 flex-row items-center gap-5 p-5',
        complete && 'bg-lime text-lime-foreground'
      )}
    >
      <span className="font-display text-stat leading-none tabular-nums">
        {done}
        <span className="opacity-50">/{total}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* A segment per item up to 12, one bar for a longer run: SegmentBar decides (DS §7). */}
        {total > 0 && (
          <SegmentBar
            value={done}
            total={total}
            states={items.map((i) => i.done)}
            tone={complete ? 'ink' : 'lime'}
            label={caption}
          />
        )}
        <span
          className={cn(
            'min-w-0 truncate text-meta',
            complete ? 'opacity-75' : 'text-muted-foreground'
          )}
        >
          {caption}
        </span>
      </div>
    </Card>
  )
}
