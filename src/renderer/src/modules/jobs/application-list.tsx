import type { Application, JobBoard } from '@shared/domain/jobs'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { VirtualList } from '@/components/common/virtual-list'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { APP_STATUS_LABEL, CLOSED_APP_STATUSES, salaryLabel, STAGE_KIND_SHORT, whenLabel } from './j1-labels'

/** Fixed column widths: every virtual row is its own table, so columns must line up without auto layout. */
const COL = {
  company: 'w-[18%]',
  status: 'w-32',
  next: 'w-44',
  salary: 'w-36',
  board: 'w-36',
  applied: 'w-24'
} as const

/**
 * Table view of vacancies (shadcn Table), virtualized: a sticky header table plus one fixed-layout
 * table per visible row. Rows open the editor; Enter works from the keyboard.
 */
export function ApplicationList({
  applications,
  boards,
  activeId,
  onOpen,
  loading,
  hasMore,
  loadingMore,
  onLoadMore
}: {
  applications: Application[]
  boards: JobBoard[]
  activeId: string | null
  onOpen: (id: string) => void
  loading?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}) {
  const boardById = new Map(boards.map((b) => [b.id, b]))
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Вакансія</TableHead>
            <TableHead className={COL.company}>Компанія</TableHead>
            <TableHead className={COL.status}>Статус</TableHead>
            <TableHead className={COL.next}>Наступний етап</TableHead>
            <TableHead className={COL.salary}>Зарплата</TableHead>
            <TableHead className={COL.board}>Майданчик</TableHead>
            <TableHead className={cn(COL.applied, 'text-right')}>Надіслано</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
      <VirtualList
        items={applications}
        loading={loading}
        getKey={(a) => a.id}
        estimateSize={45}
        gap={0}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        empty={
          !loading && <div className="py-10 text-center text-body text-muted-foreground">Під фільтр нічого не потрапило.</div>
        }
        renderItem={(a) => {
          const board = a.boardId ? boardById.get(a.boardId) : undefined
          const closed = CLOSED_APP_STATUSES.includes(a.status)
          return (
            <Table className="table-fixed">
              <TableBody>
                <TableRow
                  tabIndex={0}
                  data-state={activeId === a.id ? 'selected' : undefined}
                  onClick={() => onOpen(a.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpen(a.id)}
                  className={cn('cursor-pointer border-b!', closed && 'text-muted-foreground')}
                >
                  <TableCell className="truncate font-medium">{a.title}</TableCell>
                  <TableCell className={cn(COL.company, 'truncate')}>{a.company || '—'}</TableCell>
                  <TableCell className={COL.status}>
                    <Badge variant={a.status === 'offer' || a.status === 'accepted' ? 'lime' : closed ? 'outline' : 'soft'}>
                      {APP_STATUS_LABEL[a.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className={cn(COL.next, 'truncate text-caption')}>
                    {a.nextStage ? `${STAGE_KIND_SHORT[a.nextStage.kind]}, ${whenLabel(a.nextStage.at)}` : '—'}
                  </TableCell>
                  <TableCell className={cn(COL.salary, 'truncate tabular-nums')}>
                    {salaryLabel(a.salaryMin, a.salaryMax, a.currency) ?? '—'}
                  </TableCell>
                  <TableCell className={cn(COL.board, 'truncate')}>
                    {board ? (
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: board.color ?? 'var(--muted-foreground)' }} />
                        <span className="truncate">{board.name}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className={cn(COL.applied, 'text-right tabular-nums')}>
                    {a.appliedAt ? fmtDate(a.appliedAt, 'd MMM') : '—'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )
        }}
      />
    </div>
  )
}
