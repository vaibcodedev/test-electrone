import { ListChecks } from 'lucide-react'
import type { BoardDetails } from '@shared/domain/boards'
import { TagList } from '@/components/common/tags'
import { cn } from '@/lib/utils'
import { DueChip } from './card-tile'
import { PRIORITY_DOT, PRIORITY_LABEL } from './labels'

/** Cards as rows, grouped by column. */
export function ListView({ details, onOpenCard }: { details: BoardDetails; onOpenCard: (id: string) => void }) {
  return (
    <div className="h-full overflow-y-auto px-8 pb-8">
      <div className="flex flex-col gap-6">
        {details.columns.map((col) => {
          const cards = details.cards.filter((c) => c.columnId === col.id).sort((a, b) => a.position - b.position)
          return (
            <section key={col.id}>
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium">
                {col.title}
                <span className="font-normal text-muted-foreground tabular-nums">{cards.length}</span>
              </h2>
              {cards.length === 0 ? (
                <p className="rounded-2xl bg-surface px-4 py-3 text-[12.5px] text-muted-foreground">Пусто</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {cards.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onOpenCard(c.id)}
                        className="grid w-full grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 rounded-2xl bg-surface px-4 py-2.5 text-left hover:bg-accent"
                      >
                        <span title={PRIORITY_LABEL[c.priority]} className={cn('size-2 rounded-full', PRIORITY_DOT[c.priority])} />
                        <span className={cn('truncate text-[13px]', col.isDone && 'text-muted-foreground line-through')}>{c.title}</span>
                        <TagList tags={c.tags} max={2} />
                        {c.checklistTotal > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground tabular-nums">
                            <ListChecks className="size-3.5" /> {c.checklistDone}/{c.checklistTotal}
                          </span>
                        ) : (
                          <span />
                        )}
                        {c.dueAt ? <DueChip dueAt={c.dueAt} done={col.isDone} /> : <span className="w-16" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
