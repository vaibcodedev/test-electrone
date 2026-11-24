import type { Application, JobBoard } from '@shared/domain/jobs'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { APP_STATUS_LABEL, CLOSED_APP_STATUSES, salaryLabel, STAGE_KIND_SHORT, whenLabel } from './j1-labels'

/** Table view of vacancies (shadcn Table). Rows open the editor; Enter works from the keyboard. */
export function ApplicationList({
  applications,
  boards,
  activeId,
  onOpen
}: {
  applications: Application[]
  boards: JobBoard[]
  activeId: string | null
  onOpen: (id: string) => void
}) {
  const boardById = new Map(boards.map((b) => [b.id, b]))
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Вакансия</TableHead>
          <TableHead>Компания</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead>Следующий этап</TableHead>
          <TableHead>Зарплата</TableHead>
          <TableHead>Площадка</TableHead>
          <TableHead className="text-right">Отправлено</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {applications.map((a) => {
          const board = a.boardId ? boardById.get(a.boardId) : undefined
          const closed = CLOSED_APP_STATUSES.includes(a.status)
          return (
            <TableRow
              key={a.id}
              tabIndex={0}
              data-state={activeId === a.id ? 'selected' : undefined}
              onClick={() => onOpen(a.id)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(a.id)}
              className={cn('cursor-pointer', closed && 'text-muted-foreground')}
            >
              <TableCell className="max-w-72 truncate font-medium">{a.title}</TableCell>
              <TableCell className="max-w-48 truncate">{a.company || '—'}</TableCell>
              <TableCell>
                <Badge variant={a.status === 'offer' || a.status === 'accepted' ? 'lime' : closed ? 'outline' : 'soft'}>
                  {APP_STATUS_LABEL[a.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-[12.5px]">
                {a.nextStage ? `${STAGE_KIND_SHORT[a.nextStage.kind]}, ${whenLabel(a.nextStage.at)}` : '—'}
              </TableCell>
              <TableCell className="tabular-nums">{salaryLabel(a.salaryMin, a.salaryMax, a.currency) ?? '—'}</TableCell>
              <TableCell>
                {board ? (
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: board.color ?? 'var(--muted-foreground)' }} />
                    {board.name}
                  </span>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{a.appliedAt ? fmtDate(a.appliedAt, 'd MMM') : '—'}</TableCell>
            </TableRow>
          )
        })}
        {applications.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
              Под фильтр ничего не попало.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
