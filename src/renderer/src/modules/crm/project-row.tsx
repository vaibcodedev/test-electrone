import { useState, type ReactNode, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { CalendarDays } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import type { ProjectSummary } from '@shared/domain/crm'
import { fmtDay, fmtHours, fmtMoney, fmtMoneyCompact, fmtPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Item } from '@/components/ui/item'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  BILLING_LABEL,
  budgetShareLabel,
  NOT_TRACKED,
  paidShareLabel,
  PRICE_MISSING,
  PROJECT_STATUS_BADGE,
  PROJECT_STATUS_LABEL,
  RETAINER_MISSING,
  retainerMonthsLabel
} from './labels'
import { Meter } from './parts'
import { PlatformName } from './platform-fields'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { bindMenu, RecordMenuTile } from '@/features/record-menu/record-menu'
import { projectMenu } from './menus'

const muted = (text: string): ReactNode => <span className="text-muted-foreground">{text}</span>

/**
 * Middle zone: one money/time line, a thin bar under it, and «чекаємо» only when something is owed.
 * Missing amounts use the project header's words (labels.ts): a zero never passes for data. Sums from
 * 100 тис. are compact («100 млн USD»): a row never cuts a number in the middle; `full` is the whole line
 * for the tooltip.
 */
function ProjectMoney({ p }: { p: ProjectSummary }): ReactElement {
  const fm = (v: number): string => fmtMoney(v, p.currency)
  const m = (v: number): ReactNode => <span title={fm(v)}>{fmtMoneyCompact(v, p.currency)}</span>
  let line: ReactNode
  let full: string
  let bar: ReactNode = null
  if (p.billing === 'fixed') {
    if (p.fixedPrice > 0) {
      line = (
        <>
          {m(p.paidAmount)} <span className="text-muted-foreground">з {m(p.fixedPrice)}</span>
        </>
      )
      full = `${fm(p.paidAmount)} з ${fm(p.fixedPrice)}`
      bar = (
        <Meter
          value={p.paidAmount}
          max={p.fixedPrice}
          label={paidShareLabel(p)}
          className="mt-1.5"
        />
      )
    } else if (p.paidAmount > 0) {
      line = (
        <>
          оплачено {m(p.paidAmount)}
          {muted(` · ${PRICE_MISSING}`)}
        </>
      )
      full = `оплачено ${fm(p.paidAmount)} · ${PRICE_MISSING}`
    } else {
      full = PRICE_MISSING
      line = muted(full)
    }
  } else if (p.billing === 'hourly') {
    const tracked = p.trackedMinutes > 0
    const budget = p.budgetHours > 0 ? fmtHours(p.budgetHours * 60) : ''
    const head = tracked ? fmtHours(p.trackedMinutes) : NOT_TRACKED
    const tail =
      (budget ? (tracked ? ` з ${budget}` : ` · бюджет ${budget}`) : '') +
      (p.rate === 0 ? ' · ставку не вказано' : '')
    line = (
      <>
        {tracked ? head : muted(head)}
        {tail && muted(tail)}
      </>
    )
    full = head + tail
    if (tracked && budget) {
      bar = (
        <Meter
          value={p.trackedMinutes / 60}
          max={p.budgetHours}
          label={budgetShareLabel(p)}
          className="mt-1.5"
        />
      )
    }
  } else if (p.billing === 'retainer') {
    if (p.fixedPrice > 0) {
      const tail = `/міс${p.retainerMonths > 0 ? ` · ${retainerMonthsLabel(p.retainerMonths)}` : ''}`
      line = (
        <>
          {m(p.fixedPrice)}
          {muted(tail)}
        </>
      )
      full = fm(p.fixedPrice) + tail
    } else {
      full = RETAINER_MISSING
      line = muted(full)
    }
  } else {
    full = p.trackedMinutes > 0 ? `${fmtHours(p.trackedMinutes)} відстежено` : NOT_TRACKED
    line = muted(full)
  }
  const fee = p.billing !== 'none' && p.effectiveFeePercent > 0
  const money = (
    <div className="truncate text-body tabular-nums" title={fee ? undefined : full}>
      {line}
    </div>
  )
  return (
    <div className="min-w-0">
      {fee ? (
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
      {/* Waiting for money is the usual state, not a problem: only an overpayment is warn. */}
      {p.billing === 'fixed' && p.fixedPrice > 0 && p.paidAmount > p.fixedPrice ? (
        <div className="mt-1 truncate text-caption text-warn">
          переплата {m(p.paidAmount - p.fixedPrice)}
        </div>
      ) : (
        p.billing !== 'none' &&
        p.outstandingAmount > 0 && (
          <div className="mt-1 truncate text-caption text-muted-foreground">
            чекаємо <span className="text-foreground tabular-nums">{m(p.outstandingAmount)}</span>
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
    <RecordMenuTile menu={bindMenu(projectMenu, project)} className="" buttonClassName="absolute top-1/2 right-4 -mt-3">
    <Item asChild variant="muted" size="sm" className="group-hover/record-menu:bg-(--tile-hover)">
      <button
        type="button"
        onClick={() => navigate(`/projects/${project.id}`)}
        className="grid min-h-19 w-full grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_150px] items-center gap-6 py-4 pr-14 pl-5 text-left"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-body font-semibold" title={project.title}>
              {project.title}
            </span>
            <FavoriteMark entity={{ type: 'project', id: project.id }} />
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
    </RecordMenuTile>
  )
}
