import { useState, type ReactNode, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { CalendarDays } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import type { ProjectSummary } from '@shared/domain/crm'
import { fmtDay, fmtHours, fmtMoney, fmtMoneyCompact, fmtPercent, plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Item } from '@/components/ui/item'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { BILLING_LABEL, PROJECT_STATUS_BADGE, PROJECT_STATUS_LABEL } from './labels'
import { Meter } from './parts'
import { PlatformName } from './platform-fields'

/**
 * Middle zone: one money/time line, a thin bar under it, and «чекаємо» only when something is owed.
 * Sums from 100 тис. are compact («100 млн USD»): a row never cuts a number in the middle.
 */
function ProjectMoney({ p }: { p: ProjectSummary }): ReactElement {
  const m = (v: number): ReactNode => (
    <span title={fmtMoney(v, p.currency)}>{fmtMoneyCompact(v, p.currency)}</span>
  )
  let line: ReactNode
  let bar: ReactNode = null
  if (p.billing === 'fixed') {
    if (p.fixedPrice > 0) {
      line = (
        <>
          {m(p.paidAmount)} <span className="text-muted-foreground">з {m(p.fixedPrice)}</span>
        </>
      )
      bar = <Meter value={p.paidAmount} max={p.fixedPrice} className="mt-1.5" />
    } else if (p.paidAmount > 0) {
      line = (
        <>
          оплачено {m(p.paidAmount)}
          <span className="text-muted-foreground"> · ціну не вказано</span>
        </>
      )
    } else {
      line = <span className="text-muted-foreground">Ціну не вказано</span>
    }
  } else if (p.billing === 'hourly') {
    line = (
      <>
        {fmtHours(p.trackedMinutes)}
        {p.budgetHours > 0 && (
          <span className="text-muted-foreground"> з {fmtHours(p.budgetHours * 60)}</span>
        )}
      </>
    )
    if (p.budgetHours > 0)
      bar = <Meter value={p.trackedMinutes / 60} max={p.budgetHours} className="mt-1.5" />
  } else if (p.billing === 'retainer') {
    line = (
      <>
        {m(p.fixedPrice)}
        <span className="text-muted-foreground">
          /міс · {p.retainerMonths} {plural(p.retainerMonths, ['місяць', 'місяці', 'місяців'])}
        </span>
      </>
    )
  } else {
    line = <span className="text-muted-foreground">{fmtHours(p.trackedMinutes)} враховано</span>
  }
  const money = <div className="truncate text-body tabular-nums">{line}</div>
  return (
    <div className="min-w-0">
      {p.billing !== 'none' && p.effectiveFeePercent > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>{money}</TooltipTrigger>
          <TooltipContent>
            На руки після комісії {fmtPercent(p.effectiveFeePercent)}:{' '}
            {fmtMoney(p.netPaidAmount, p.currency)}
          </TooltipContent>
        </Tooltip>
      ) : (
        money
      )}
      {bar}
      {p.billing === 'fixed' && p.fixedPrice > 0 && p.paidAmount > p.fixedPrice ? (
        <div className="mt-1 truncate text-caption text-warn">
          переплата {m(p.paidAmount - p.fixedPrice)}
        </div>
      ) : (
        p.billing !== 'none' &&
        p.outstandingAmount > 0 && (
          <div className="mt-1 truncate text-caption text-warn">
            чекаємо {m(p.outstandingAmount)}
          </div>
        )
      )}
    </div>
  )
}

/**
 * Project row in three calm zones: title + status badge and a muted «клієнт · оплата · платформа» line;
 * one money line with a thin bar; deadline on the right (warn ≤3 days, destructive when overdue).
 */
export function ProjectRow({
  project,
  showClient = true
}: {
  project: ProjectSummary
  showClient?: boolean
}): ReactElement {
  const navigate = useNavigate()
  const [today] = useState(() => Date.now())
  const daysLeft = project.dueAt !== null ? differenceInCalendarDays(project.dueAt, today) : null
  const live = project.status === 'active' || project.status === 'lead'
  const overdue = live && daysLeft !== null && daysLeft < 0
  const soon = live && daysLeft !== null && daysLeft >= 0 && daysLeft <= 3
  return (
    <Item asChild variant="muted" size="sm">
      <button
        type="button"
        onClick={() => navigate(`/projects/${project.id}`)}
        className="grid min-h-[76px] w-full grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_150px] items-center gap-6 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-body font-semibold" title={project.title}>
              {project.title}
            </span>
            <Badge variant={PROJECT_STATUS_BADGE[project.status]} className="shrink-0">
              {PROJECT_STATUS_LABEL[project.status]}
            </Badge>
          </div>
          {/* The platform's colour dot is its separator: no «·» before it. */}
          <div className="mt-1 flex min-w-0 items-center gap-2.5 text-caption text-muted-foreground">
            <span className="truncate">
              {showClient && `${project.clientName ?? 'Без клієнта'} · `}
              {BILLING_LABEL[project.billing]}
            </span>
            {project.platformId && (
              <PlatformName
                platformId={project.platformId}
                name={project.platformName}
                className="shrink-0"
              />
            )}
          </div>
        </div>
        <ProjectMoney p={project} />
        <div
          className={cn(
            'flex items-center justify-end gap-1.5 text-caption whitespace-nowrap',
            overdue ? 'text-destructive' : soon ? 'text-warn' : 'text-muted-foreground'
          )}
        >
          {project.dueAt && (
            <>
              <CalendarDays className="size-3.5" />
              до {fmtDay(project.dueAt)}
            </>
          )}
        </div>
      </button>
    </Item>
  )
}
