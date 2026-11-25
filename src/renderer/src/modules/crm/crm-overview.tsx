import type { ReactElement } from 'react'
import { MoneyLines, moneyEntries } from '@/components/common/money-value'
import { useApi } from '@/lib/query'
import { fmtHours, fmtMinutes, plural } from '@/lib/format'
import { StatTile } from '@/components/common/stat-tile'
import { EmptyValue } from './parts'

/** Money is the main metric; hours are secondary (most work isn't hourly). Empty tiles say so in words. */
export function CrmOverview(): ReactElement {
  const { data } = useApi('projects', 'overview')
  if (!data) return <div className="grid h-[118px] grid-cols-4 gap-3" />
  const owed = moneyEntries(data.outstanding).length > 0
  return (
    <div className="stagger grid grid-cols-4 gap-3">
      <StatTile
        tone="ink"
        label="Оплачено цього місяця"
        value={
          moneyEntries(data.paidThisMonth).length ? (
            <MoneyLines
              value={data.paidThisMonth}
              compact
              emptyLabel=""
              className="text-headline"
            />
          ) : (
            // On ink: its own muted colour, not muted-foreground (MoneyLines' empty phrase).
            <EmptyValue className="text-ink-muted">ще немає оплат</EmptyValue>
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
            ? `${data.overduePayments} ${plural(data.overduePayments, ['прострочена', 'прострочені', 'прострочено'])}`
            : owed
              ? 'Прострочок немає'
              : undefined
        }
      />
      <StatTile label="Проєкти в роботі" value={data.activeProjects} />
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
