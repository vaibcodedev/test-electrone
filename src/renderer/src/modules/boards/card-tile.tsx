import { forwardRef, type HTMLAttributes } from 'react'
import { format } from 'date-fns'
import { CalendarClock, CircleAlert, ListChecks, Repeat } from 'lucide-react'
import type { Card, CardRepeat } from '@shared/domain/boards'
import { fmtDay, mdPreview } from '@/lib/format'
import { TagList } from '@/components/common/tags'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card as UiCard } from '@/components/ui/card'
import { PRIORITY_DOT, PRIORITY_LABEL } from './labels'
import { hasTime, isOverdue } from './use-card-param'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { repeatText, WEEKDAY_SHORT } from './repeat'

/** The repeat of a card in a few letters: «щодня», «пн, ср», «31-го». */
function repeatShort(rule: CardRepeat): string {
  if (rule.freq === 'daily') return 'щодня'
  if (rule.freq === 'monthly') return rule.day ? `${rule.day}-го` : 'щомісяця'
  return rule.days.length === 7
    ? 'щодня'
    : rule.days.map((d) => WEEKDAY_SHORT[d - 1].toLowerCase()).join(', ')
}

/** A repeating card's mark: the next card comes when this one reaches «Готово». */
export function RepeatChip({ rule, className }: { rule: CardRepeat; className?: string }) {
  return (
    <Badge
      variant="outline"
      title={`Повторюється: ${repeatText(rule).toLowerCase()}`}
      className={cn('h-5 px-2 text-meta text-muted-foreground', className)}
    >
      <Repeat aria-hidden />
      <span className="sr-only">Повторюється: </span>
      {repeatShort(rule)}
    </Badge>
  )
}

export function DueChip({
  dueAt,
  done,
  className
}: {
  dueAt: number
  done: boolean
  className?: string
}) {
  const late = isOverdue(dueAt, done)
  const when = hasTime(dueAt) ? `${fmtDay(dueAt)} о ${format(dueAt, 'HH:mm')}` : fmtDay(dueAt)
  // Overdue is said in words and by the icon too, not by the red colour alone (WCAG 1.4.1). The words go
  // in as sr-only text: aria-label on a plain span is not announced.
  return (
    <Badge
      variant={late ? 'destructive' : done ? 'success' : 'outline'}
      title={late ? `Прострочено: ${when}` : undefined}
      className={cn('h-5 px-2 text-meta', !late && !done && 'text-muted-foreground', className)}
    >
      {late ? <CircleAlert aria-hidden /> : <CalendarClock aria-hidden />}
      {late && <span className="sr-only">Прострочено: </span>}
      {when}
    </Badge>
  )
}

/** Compact kanban card. Presentational: drag props are passed in by the sortable wrapper. */
export const CardTile = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    card: Card
    done: boolean
    dragging?: boolean
    overlay?: boolean
  }
>(function CardTile({ card, done, dragging, overlay, className, ...rest }, ref) {
  return (
    <UiCard
      ref={ref}
      {...rest}
      className={cn(
        'cursor-grab gap-0 rounded-2xl bg-card p-3 text-left shadow-[0_1px_0_rgb(0_0_0/0.04)] ring-1 ring-border transition-shadow select-none hover:ring-foreground/15 active:cursor-grabbing',
        dragging && 'opacity-35',
        overlay && 'rotate-[1.5deg] shadow-xl ring-foreground/20',
        className
      )}
    >
      <div className="flex items-start gap-2">
        {card.priority !== 'none' && (
          <span
            title={PRIORITY_LABEL[card.priority]}
            className={cn('mt-1.25 size-2 shrink-0 rounded-full', PRIORITY_DOT[card.priority])}
          />
        )}
        <span
          className={cn(
            'line-clamp-4 min-w-0 flex-1 text-body leading-snug wrap-anywhere',
            done && 'text-muted-foreground line-through'
          )}
        >
          {card.title}
        </span>
        <FavoriteMark entity={{ type: 'card', id: card.id }} className="mt-0.5" />
      </div>
      {card.description.trim() && (
        <p
          className={cn(
            'mt-1 line-clamp-2 text-caption text-muted-foreground',
            card.priority !== 'none' && 'pl-4'
          )}
        >
          {mdPreview(card.description)}
        </p>
      )}
      {card.tags.length > 0 && <TagList tags={card.tags} max={3} className="mt-2" />}
      {(card.dueAt || card.checklistTotal > 0 || card.repeat) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.dueAt && <DueChip dueAt={card.dueAt} done={done} />}
          {card.repeat && <RepeatChip rule={card.repeat} />}
          {card.checklistTotal > 0 && (
            <Badge
              variant={card.checklistDone === card.checklistTotal ? 'success' : 'soft'}
              className={cn(
                'h-5 px-2 text-meta',
                card.checklistDone !== card.checklistTotal && 'text-muted-foreground'
              )}
            >
              <ListChecks />
              {card.checklistDone}/{card.checklistTotal}
            </Badge>
          )}
        </div>
      )}
    </UiCard>
  )
})
