import { format } from 'date-fns'
import type { BoardDay, DailyBoard } from '@shared/domain/jobs'
import { LOCALE } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const parseDay = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Single-hue sequential scale (dataviz): done = chart-1, partial = chart-1 at low opacity,
 * missed = surface, not expected = transparent outline. Values are always in the tooltip.
 */
function cellClass(day: BoardDay, target: number): string {
  if (day.done) return 'bg-chart-1'
  if (day.applied > 0 && target > 0) return 'bg-chart-1/35'
  if (!day.expected) return 'bg-transparent ring-1 ring-inset ring-border'
  // Missed day: visible on the surface card in both themes.
  return 'bg-foreground/10'
}

function describe(day: BoardDay, target: number): string {
  const parts = [`откликов: ${day.applied}${target > 0 ? ` из ${target}` : ''}`]
  if (day.checked) parts.push('отмечено вручную')
  if (!day.expected) parts.push('выходной для площадки')
  else parts.push(day.done ? 'норма выполнена' : 'не выполнено')
  return parts.join(' · ')
}

/** Board × day grid (like a GitHub contribution graph) for the daily job-board habit. */
export function DailyHeatmap({ boards }: { boards: DailyBoard[] }) {
  if (!boards.length) return null
  const days = boards[0].history
  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      <div className="grid items-center gap-x-1 gap-y-2" style={{ gridTemplateColumns: `minmax(90px, 120px) repeat(${days.length}, minmax(10px, 1fr)) 56px` }}>
        <span />
        {days.map((d, i) => (
          <span key={d.day} className="text-center text-[10px] text-muted-foreground tabular-nums">
            {i % 7 === 0 || i === days.length - 1 ? format(parseDay(d.day), 'd') : ''}
          </span>
        ))}
        <span className="text-right text-[10.5px] text-muted-foreground">серия</span>
        {boards.map((b) => (
          <BoardRow key={b.id} board={b} />
        ))}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] bg-chart-1" /> норма выполнена
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] bg-chart-1/35" /> частично
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] bg-foreground/10" /> пропуск
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] ring-1 ring-inset ring-border" /> выходной
        </span>
      </div>
    </div>
  )
}

function BoardRow({ board }: { board: DailyBoard }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2 text-[12.5px]">
        <span className="size-2 shrink-0 rounded-full" style={{ background: board.color ?? 'var(--muted-foreground)' }} />
        <span className="truncate">{board.name}</span>
      </span>
      {board.history.map((d) => (
        <Tooltip key={d.day}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              aria-label={`${board.name}, ${d.day}: ${describe(d, board.dailyTarget)}`}
              className={cn('aspect-square w-full min-w-2.5 rounded-[3px]', cellClass(d, board.dailyTarget))}
            />
          </TooltipTrigger>
          <TooltipContent>
            <div className="font-medium">{format(parseDay(d.day), 'EEEE, d MMMM', { locale: LOCALE })}</div>
            <div className="opacity-80">{describe(d, board.dailyTarget)}</div>
          </TooltipContent>
        </Tooltip>
      ))}
      <span className="text-right text-[12px] tabular-nums">{board.streak} дн.</span>
    </>
  )
}
