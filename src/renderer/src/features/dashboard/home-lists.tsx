import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { Pin } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import type { DashboardData } from '@shared/domain/system'
import { fmtRelative } from '@/lib/format'
import { EntityRow } from '@/components/common/entity-link'
import { CardEmptyText, ListCard } from '@/components/common/list-card'
import { Button } from '@/components/ui/button'
import { ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { RowLink } from './row-link'

const LIST_LIMIT = 7

/** Records pinned to the home page (★ is the section's own order, not here); past seven the rest unfolds in place. */
export function PinnedCard({ pinned }: Pick<DashboardData, 'pinned'>): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const all = pinned
  const shown = expanded ? all : all.slice(0, LIST_LIMIT)
  return (
    <ListCard title="Закріплено" className="col-span-4">
      {all.length ? (
        <>
          <div className="-mx-2.5 flex flex-col">
            {shown.map((p) => (
              <EntityRow
                key={`${p.kind}:${p.type}:${p.id}`}
                item={p}
                trailing={<Pin className="size-3.5 text-muted-foreground" />}
              />
            ))}
          </div>
          {all.length > LIST_LIMIT && (
            <Button
              variant="subtle"
              size="xs"
              className="mt-2"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'Згорнути' : `Ще ${all.length - LIST_LIMIT}`}
            </Button>
          )}
        </>
      ) : (
        <CardEmptyText>Натисніть шпильку в будь-якому записі, щоб він з’явився тут.</CardEmptyText>
      )}
    </ListCard>
  )
}

export function RecentCard({ recent }: Pick<DashboardData, 'recent'>): ReactElement {
  return (
    <ListCard title="Нещодавно змінювалось" className="col-span-4">
      {recent.length ? (
        <div className="-mx-2.5 flex flex-col">
          {recent.slice(0, LIST_LIMIT).map((r) => (
            <EntityRow
              key={`${r.type}:${r.id}`}
              item={r}
              trailing={
                <span className="text-meta text-muted-foreground">{fmtRelative(r.updatedAt)}</span>
              }
            />
          ))}
        </div>
      ) : (
        <CardEmptyText>Тут з’являться записи, які ви змінювали останніми.</CardEmptyText>
      )}
    </ListCard>
  )
}

export function InboxIdeasCard({
  ideas,
  className
}: {
  ideas: DashboardData['inboxIdeas']
  /** Column span from the home grid (layout.ts). */
  className?: string
}): ReactElement {
  const navigate = useNavigate()
  return (
    <ListCard
      title="Ідеї у вхідних"
      className={className}
      action={
        <Button variant="subtle" size="xs" onClick={() => navigate('/ideas')}>
          Усі ідеї
        </Button>
      }
    >
      {ideas.length ? (
        <div className="flex flex-wrap gap-2">
          {ideas.map((i) => (
            <Button
              key={i.id}
              variant="soft"
              size="sm"
              className="max-w-full bg-card font-normal hover:ring-1 hover:ring-border"
              title={i.title}
              onClick={() => navigate(ENTITY_META.idea.route(i.id))}
            >
              <span className="truncate">{i.title}</span>
            </Button>
          ))}
        </div>
      ) : (
        <CardEmptyText>
          Вхідні порожні. Глобальна комбінація клавіш швидкого додавання працює навіть із трею.
        </CardEmptyText>
      )}
    </ListCard>
  )
}

export function ReadingCard({
  reading,
  className
}: Pick<DashboardData, 'reading'> & { className?: string }): ReactElement {
  return (
    <ListCard title="Читаю зараз" className={className}>
      {reading.length ? (
        <ItemGroup className="gap-2">
          {reading.map((b) => (
            <RowLink key={b.id} to={ENTITY_META.bookmark.route(b.id)} className="bg-card">
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full truncate font-normal">{b.title}</ItemTitle>
              </ItemContent>
              {/* Progress is always signed (§7): the number for the eye, the label for a screen reader. */}
              <Progress
                value={b.progress}
                aria-label={`Прочитано ${b.progress}%`}
                className="h-1.5 w-20 bg-surface *:data-[slot=progress-indicator]:bg-chart-1"
              />
              <span className="w-9 text-right text-meta tabular-nums text-muted-foreground">
                {b.progress}%
              </span>
            </RowLink>
          ))}
        </ItemGroup>
      ) : (
        <CardEmptyText>Позначте закладку «читаю» — прогрес буде тут.</CardEmptyText>
      )}
    </ListCard>
  )
}
