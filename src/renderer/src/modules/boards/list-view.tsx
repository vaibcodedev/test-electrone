import { ListChecks } from 'lucide-react'
import type { BoardDetails } from '@shared/domain/boards'
import { TagList } from '@/components/common/tags'
import { SectionLabel } from '@/components/common/master-detail'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { DueChip } from './card-tile'
import { PRIORITY_DOT, PRIORITY_LABEL } from './labels'

/** Cards as table rows (shadcn Table), grouped by column. */
export function ListView({ details, onOpenCard }: { details: BoardDetails; onOpenCard: (id: string) => void }) {
  return (
    <div className="h-full overflow-y-auto px-8 pb-8">
      <div className="flex flex-col gap-6">
        {details.columns.map((col) => {
          const cards = details.cards.filter((c) => c.columnId === col.id).sort((a, b) => a.position - b.position)
          return (
            <section key={col.id} className="flex flex-col gap-2">
              <SectionLabel action={<span className="text-caption text-muted-foreground tabular-nums">{cards.length}</span>}>
                <span className="text-body text-foreground">{col.title}</span>
              </SectionLabel>
              {cards.length === 0 ? (
                <Empty className="items-start rounded-2xl bg-surface p-3 md:p-3">
                  <EmptyDescription className="text-caption">Порожньо</EmptyDescription>
                </Empty>
              ) : (
                <div className="overflow-hidden rounded-2xl bg-surface">
                  <Table>
                    <TableBody>
                      {cards.map((c) => (
                        <TableRow
                          key={c.id}
                          tabIndex={0}
                          role="button"
                          onClick={() => onOpenCard(c.id)}
                          onKeyDown={(e) => e.key === 'Enter' && onOpenCard(c.id)}
                          className="border-border hover:bg-accent"
                        >
                          <TableCell className="w-6 pl-4">
                            <span
                              title={PRIORITY_LABEL[c.priority]}
                              className={cn('block size-2 rounded-full', PRIORITY_DOT[c.priority])}
                            />
                          </TableCell>
                          <TableCell
                            className={cn('w-full max-w-0 truncate text-body', col.isDone && 'text-muted-foreground line-through')}
                          >
                            {c.title}
                          </TableCell>
                          <TableCell>
                            <TagList tags={c.tags} max={2} className="flex-nowrap" />
                          </TableCell>
                          <TableCell className="text-meta text-muted-foreground tabular-nums">
                            {c.checklistTotal > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <ListChecks className="size-3.5" /> {c.checklistDone}/{c.checklistTotal}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            {c.dueAt && <DueChip dueAt={c.dueAt} done={col.isDone} />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
