import type { ReactElement } from 'react'
import { format, startOfDay } from 'date-fns'
import type { BoardDay, DailyBoard } from '@shared/domain/jobs'
import { LOCALE } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BoardDot } from './board-label'
import { daysWord } from './labels'

const parseDay = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** A day before the board was added: main marks it not expected, but it is not a day off. */
const beforeBoard = (day: BoardDay, board: DailyBoard): boolean =>
  parseDay(day.day).getTime() < startOfDay(board.createdAt).getTime()

/**
 * Single-hue sequential scale (dataviz): done = chart-1, partial = chart-1 at low opacity,
 * missed = surface, day off = transparent outline, before the board existed = empty. Values are always in the tooltip.
 */
function cellClass(day: BoardDay, board: DailyBoard): string {
  if (day.done) return 'bg-chart-1'
  if (day.applied > 0 && board.dailyTarget > 0) return 'bg-chart-1/35'
  if (beforeBoard(day, board)) return 'bg-transparent'
  if (!day.expected) return 'bg-transparent ring-1 ring-inset ring-border'
  // Missed day: visible on the surface card in both themes.
  return 'bg-foreground/10'
}

function describe(day: BoardDay, board: DailyBoard): string {
  const target = board.dailyTarget
  const parts = [`відгуків: ${day.applied}${target > 0 ? ` з ${target}` : ''}`]
  if (day.checked) parts.push('позначено вручну')
  if (beforeBoard(day, board)) parts.push('сайт ще не додано')
  else if (!day.expected) parts.push('вихідний для сайту')
  else parts.push(day.done ? 'норму виконано' : 'не виконано')
  return parts.join(' · ')
}

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

/** Mini tile; `phrase` = a sentence instead of a number when there is no data yet. */
function Stat({ label, value, phrase }: { label: string; value: string; phrase?: boolean }): ReactElement {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-3">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className={phrase ? 'text-body text-muted-foreground' : 'font-display text-stat-sm leading-none tabular-nums'}>{value}</span>
    </div>
  )
}

/** Board × day grid (like a GitHub contribution graph) for the daily job-board habit, grouped by weeks. */
export function DailyHeatmap({ boards }: { boards: DailyBoard[] }): ReactElement | null {
  if (!boards.length) return null
  const days = boards[0].history
  const weeks = chunk(days, 7)
  const applied = boards.reduce((n, b) => n + b.history.reduce((m, d) => m + d.applied, 0), 0)
  // Days, not board × day pairs: a day counts when some board expected it, and is done when every such board is.
  const countedDays = days
    .map((_, i) => boards.map((b) => b.history[i]).filter((d) => d?.expected))
    .filter((exp) => exp.length > 0)
  const expected = countedDays.length
  const done = countedDays.filter((exp) => exp.every((d) => d.done)).length
  const best = boards.reduce((n, b) => Math.max(n, b.streak), 0)
  const cols = `minmax(84px, 112px) repeat(${weeks.length}, minmax(0, 1fr)) 56px`

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Відгуків" value={String(applied)} />
        <Stat label="Днів із нормою" value={expected ? `${done} з ${expected}` : 'ще немає днів'} phrase={!expected} />
        {/* The longest of the streaks running now (b.streak counts back from today), not an all-time record. */}
        <Stat label="Найдовша поточна серія" value={best ? daysWord(best) : 'ще немає серії'} phrase={!best} />
      </div>

      <div className="flex flex-col gap-2 overflow-x-auto overflow-y-hidden">
        <div className="grid items-end gap-x-2.5" style={{ gridTemplateColumns: cols }}>
          <span />
          {weeks.map((w) => (
            <span key={w[0].day} className="text-meta text-muted-foreground tabular-nums">
              {format(parseDay(w[0].day), 'd MMM', { locale: LOCALE })}
            </span>
          ))}
          <span className="text-right text-meta text-muted-foreground">серія</span>
        </div>
        {boards.map((b) => {
          const boardExpected = b.history.filter((d) => d.expected).length
          const boardDone = b.history.filter((d) => d.expected && d.done).length
          return (
            <div key={b.id} className="grid items-center gap-x-2.5" style={{ gridTemplateColumns: cols }}>
              {/* One Tab stop per board (not per cell): the row name carries the summary; cells keep hover tooltips. */}
              <span
                tabIndex={0}
                aria-label={`${b.name}: норму виконано ${boardDone} з ${daysWord(boardExpected)}, серія ${daysWord(b.streak)}`}
                className="flex min-w-0 items-center gap-2 rounded-md text-body font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <BoardDot color={b.color} />
                <span className="truncate">{b.name}</span>
              </span>
              {chunk(b.history, 7).map((w) => (
                <div key={w[0].day} className="grid grid-cols-7 gap-0.75">
                  {w.map((d) => (
                    <Cell key={d.day} board={b} day={d} />
                  ))}
                </div>
              ))}
              <span className={cn('text-right text-caption tabular-nums', b.streak ? 'font-semibold' : 'text-muted-foreground')}>
                {b.streak ? daysWord(b.streak) : '—'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] bg-chart-1" /> норму виконано
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] bg-chart-1/35" /> частково
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] bg-foreground/10" /> пропуск
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[4px] ring-1 ring-inset ring-border" /> вихідний
        </span>
      </div>
    </div>
  )
}

function Cell({ board, day: d }: { board: DailyBoard; day: BoardDay }): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('h-7 w-full rounded-[5px]', cellClass(d, board))} />
      </TooltipTrigger>
      <TooltipContent>
        <div className="font-medium">{format(parseDay(d.day), 'EEEE, d MMMM', { locale: LOCALE })}</div>
        <div className="opacity-80">{describe(d, board)}</div>
      </TooltipContent>
    </Tooltip>
  )
}
