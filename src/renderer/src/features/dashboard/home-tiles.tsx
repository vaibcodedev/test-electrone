import { useEffect, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Pause } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import { useApiMutation } from '@/lib/query'
import { fmtMinutes } from '@/lib/format'
import { clickableProps } from '@/lib/clickable'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui-store'
import { ENTITY_ICON } from '@/app/navigation'
import type { QuickTile } from './quick-tiles'
import { CardEmptyText } from '@/components/common/list-card'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Tailwind sees only whole class names: one per column count of a single-row strip. */
const ROW_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4'
}

/**
 * Quick-add tiles (the dashboard passes those whose section is in the menu): each opens quick add with its
 * target preselected. Two per row; `wide` (the strip has the whole row) puts them in one row. An odd last
 * tile of a two-column grid takes both columns, so no hole is left.
 */
export function QuickTiles({
  tiles,
  wide,
  className
}: {
  tiles: QuickTile[]
  wide?: boolean
  className?: string
}): ReactElement {
  const setQuickAddOpen = useUi((s) => s.setQuickAddOpen)
  const cols = wide ? (ROW_COLS[tiles.length] ?? 'grid-cols-4') : 'grid-cols-2'
  return (
    <div className={cn('grid gap-3', cols, className)}>
      {tiles.map((q, i) => {
        const Icon = ENTITY_ICON[q.type]
        const fill = !wide && tiles.length % 2 === 1 && i === tiles.length - 1
        return (
          <Card
            key={q.target}
            {...clickableProps(() => setQuickAddOpen(true, q.target))}
            className={cn(
              'tile h-29.5 justify-between gap-0 rounded-3xl p-4',
              fill && 'col-span-2'
            )}
          >
            <span className="grid size-9 place-items-center rounded-xl bg-foreground/[0.07]">
              <Icon className="size-4 text-muted-foreground" />
            </span>
            <span className="text-lead leading-tight font-medium">{q.label}</span>
          </Card>
        )
      })}
    </div>
  )
}

/** «Час»: the running timer (lime, with «Зупинити») or the minutes tracked this week. */
export function TimerTile({
  timer,
  weekMinutes,
  className
}: {
  timer: { projectTitle: string; startedAt: number; projectId: string } | null
  weekMinutes: number
  className?: string
}): ReactElement {
  const stop = useApiMutation('time', 'stop', { successMessage: 'Таймер зупинено' })
  const navigate = useNavigate()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [timer])
  const elapsed = timer ? Math.max(0, Math.floor((now - timer.startedAt) / 60_000)) : 0
  return (
    <Card className={cn('justify-between', timer && 'bg-lime text-lime-foreground', className)}>
      <CardHeader>
        <CardTitle className={cn(timer && 'text-lime-foreground')}>Час</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {timer ? (
          <>
            <div>
              <div className="font-display text-stat leading-none tabular-nums">
                {fmtMinutes(elapsed)}
              </div>
              <Button
                variant="link"
                className="mt-1 text-caption font-normal text-lime-foreground/75"
                onClick={() => navigate(`/projects/${timer.projectId}`)}
              >
                {timer.projectTitle}
              </Button>
            </div>
            <Button
              disabled={stop.isPending}
              onClick={() => stop.mutate(undefined)}
              className="bg-lime-foreground text-lime hover:bg-lime-foreground/90"
            >
              <Pause /> Зупинити
            </Button>
          </>
        ) : weekMinutes === 0 ? (
          // A stat tile without data says so in words (§8), not with a big «0 хв».
          <>
            <CardEmptyText>
              Цього тижня час ще не засікали — таймер запускається в контракті.
            </CardEmptyText>
            <Button
              variant="subtle"
              size="xs"
              className="self-start"
              onClick={() => navigate('/clients')}
            >
              До контрактів <ArrowRight />
            </Button>
          </>
        ) : (
          <div>
            <div className="font-display text-stat leading-none">{fmtMinutes(weekMinutes)}</div>
            <div className="mt-1 text-caption text-muted-foreground">за цей тиждень</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** «Слово дня» with the review queue as a transition. */
export function EnglishTile({
  due,
  word,
  className
}: {
  due: number
  word: { id: string; term: string; translation: string } | null
  className?: string
}): ReactElement {
  const navigate = useNavigate()
  return (
    <Card className={cn('justify-between', className)}>
      <CardHeader>
        <CardTitle>Слово дня</CardTitle>
        {due > 0 && (
          <CardAction>
            <Button variant="subtle" size="xs" onClick={() => navigate('/english/review')}>
              {due} на повторення <ArrowRight />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {word ? (
          <Button
            variant="link"
            className="flex-col items-start gap-1 text-left whitespace-normal no-underline"
            onClick={() => navigate(ENTITY_META.word.route(word.id))}
          >
            <span className="font-display text-headline leading-tight">{word.term}</span>
            <span className="text-body font-normal text-muted-foreground">{word.translation}</span>
          </Button>
        ) : (
          <CardEmptyText>Додайте слова з робочого листування — тут щодня буде одне.</CardEmptyText>
        )}
      </CardContent>
    </Card>
  )
}
