import type { ReactElement } from 'react'
import { MoneyLines } from '@/components/common/money-value'
import { moneyEntries } from '@/lib/money'
import { useApi } from '@/lib/query'
import { fmtHours, fmtMinutes, plural } from '@/lib/format'
import { StatTile } from '@/components/common/stat-tile'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyValue } from '@/components/common/empty-value'

/** Money is the main metric; hours are secondary (most work isn't hourly). Empty tiles say so in words. */
export function CrmOverview(): ReactElement {
  const { data } = useApi('projects', 'overview')
  // The skeleton is the tiles themselves: same height with a hint, so the row below doesn't jump.
  if (!data)
    return (
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <StatTile
            key={i}
            label={<Skeleton className="h-4 w-32" />}
            value={<Skeleton className="h-7 w-24" />}
            hint={<Skeleton className="h-3.5 w-24" />}
          />
        ))}
      </div>
    )
  const paid = moneyEntries(data.paidThisMonth).length > 0
  const owed = moneyEntries(data.outstanding).length > 0
  return (
    <div className="stagger grid grid-cols-4 gap-3">
      {/* The bright tile is earned by money that came in: an empty month isn't the screen's highlight. */}
      <StatTile
        tone={paid ? 'ink' : 'surface'}
        label="Оплачено цього місяця"
        value={
          <MoneyLines
            value={data.paidThisMonth}
            compact
            tone={paid ? 'ink' : 'surface'}
            emptyLabel="ще немає оплат"
            className="text-headline"
          />
        }
      />
      <StatTile
        label="Очікується до оплати"
        value={
          <MoneyLines
            value={data.outstanding}
            compact
            emptyLabel="нічого не чекаємо"
            className="text-headline"
          />
        }
        hint={
          data.overduePayments ? (
            <span className="text-warn">
              {data.overduePayments}{' '}
              {plural(data.overduePayments, [
                'оплата прострочена',
                'оплати прострочені',
                'оплат прострочено'
              ])}
            </span>
          ) : owed ? (
            'Прострочок немає'
          ) : undefined
        }
      />
      {/* Same words as the client's tile: no projects at all is not «немає активних». */}
      <StatTile
        label="Проєкти в роботі"
        value={
          !data.totalProjects ? (
            <EmptyValue>ще немає проєктів</EmptyValue>
          ) : data.activeProjects > 0 ? (
            data.activeProjects
          ) : (
            <EmptyValue>немає активних</EmptyValue>
          )
        }
        hint={
          data.totalProjects > data.activeProjects ? `з ${data.totalProjects} усього` : undefined
        }
      />
      <StatTile
        label="Облік часу за місяць"
        value={
          data.monthMinutes > 0 ? (
            fmtHours(data.monthMinutes)
          ) : (
            <EmptyValue>ще не відстежено</EmptyValue>
          )
        }
        hint={data.weekMinutes > 0 ? `${fmtMinutes(data.weekMinutes)} цього тижня` : undefined}
      />
    </div>
  )
}
