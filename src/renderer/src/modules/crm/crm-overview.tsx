import type { ReactElement } from 'react'
import { MoneyLines } from '@/components/common/money-value'
import { moneyEntries } from '@/lib/money'
import { useApi } from '@/lib/query'
import { fmtHours, fmtMinutes, plural } from '@/lib/format'
import { StatTile } from '@/components/common/stat-tile'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyValue } from './parts'

/** Money is the main metric; hours are secondary (most work isn't hourly). Empty tiles say so in words. */
export function CrmOverview(): ReactElement {
  const { data } = useApi('projects', 'overview')
  if (!data)
    return (
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="min-h-[118px] gap-3 px-5 py-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-7 w-24" />
          </Card>
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
          paid ? (
            <MoneyLines
              value={data.paidThisMonth}
              compact
              emptyLabel=""
              className="text-headline"
            />
          ) : (
            <EmptyValue>ще немає оплат</EmptyValue>
          )
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
          data.overduePayments
            ? `${data.overduePayments} ${plural(data.overduePayments, ['оплата прострочена', 'оплати прострочені', 'оплат прострочено'])}`
            : owed
              ? 'Прострочок немає'
              : undefined
        }
      />
      <StatTile
        label="Проєкти в роботі"
        value={
          data.activeProjects > 0 ? data.activeProjects : <EmptyValue>немає активних</EmptyValue>
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
