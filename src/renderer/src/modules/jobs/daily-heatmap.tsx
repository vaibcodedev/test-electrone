import { format } from 'date-fns'
import type { BoardDay, DailyBoard } from '@shared/domain/jobs'
import { LOCALE, plural } from '@/lib/format'
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

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-3">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="font-display text-[22px] leading-none tabular-nums">{value}</span>
    </div>
  )
}

/** Board × day grid (like a GitHub contribution graph) for the daily job-board habit, grouped by weeks. */
export function DailyHeatmap({ boards }: { boards: DailyBoard[] }) {
  if (!boards.length) return null
  const days = boards[0].history
  const weeks = chunk(days, 7)
  const applied = boards.reduce((n, b) => n + b.history.reduce((m, d) => m + d.applied, 0), 0)
  const expected = boards.reduce((n, b) => n + b.history.filter((d) => d.expected).length, 0)
  const done = boards.reduce((n, b) => n + b.history.filter((d) => d.expected && d.done).length, 0)
  const best = boards.reduce((n, b) => Math.max(n, b.streak), 0)
  const cols = `minmax(84px, 112px) repeat(${weeks.length}, minmax(0, 1fr)) 48px`

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Откликов" value={String(applied)} />
        <Stat label="Дней с нормой" value={expected ? `${Math.round((done / expected) * 100)}%` : '—'} />
        <Stat label="Лучшая серия" value={`${best} ${plural(best, ['день', 'дня', 'дней'])}`} />
      </div>

      <div className="flex flex-col gap-2 overflow-x-auto">
        <div className="grid items-end gap-x-2.5" style={{ gridTemplateColumns: cols }}>
          <span />
          {weeks.map((w) => (
            <span key={w[0].day} className="text-[11px] text-muted-foreground tabular-nums">
              {format(parseDay(w[0].day), 'd MMM', { locale: LOCALE })}
            </span>
          ))}
          <span className="text-right text-[11px] text-muted-foreground">серия</span>
        </div>
        {boards.map((b) => (
          <div key={b.id} className="grid items-center gap-x-2.5" style={{ gridTemplateColumns: cols }}>
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
              <span className="size-2 shrink-0 rounded-full" style={{ background: b.color ?? 'var(--muted-foreground)' }} />
              <span className="truncate">{b.name}</span>
            </span>
            {chunk(b.history, 7).map((w) => (
              <div key={w[0].day} className="grid grid-cols-7 gap-[3px]">
                {w.map((d) => (
                  <Cell key={d.day} board={b} day={d} />
                ))}
              </div>
            ))}
            <span className={cn('text-right text-[12.5px] tabular-nums', b.streak ? 'font-semibold' : 'text-muted-foreground')}>
              {b.streak} дн.
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
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

function Cell({ board, day: d }: { board: DailyBoard; day: BoardDay }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`${board.name}, ${d.day}: ${describe(d, board.dailyTarget)}`}
          className={cn('h-7 w-full rounded-[5px] outline-none focus-visible:ring-2 focus-visible:ring-ring', cellClass(d, board.dailyTarget))}
        />
      </TooltipTrigger>
      <TooltipContent>
        <div className="font-medium">{format(parseDay(d.day), 'EEEE, d MMMM', { locale: LOCALE })}</div>
        <div className="opacity-80">{describe(d, board.dailyTarget)}</div>
      </TooltipContent>
    </Tooltip>
  )
}
