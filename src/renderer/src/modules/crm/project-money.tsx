import type { ReactNode, ReactElement } from 'react'
import type { ProjectSummary } from '@shared/domain/crm'
import { MoneyValue } from '@/components/common/money-value'
import { fmtHours, fmtMoney, fmtPercent, plural } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { EmptyValue, Meter } from './parts'

/** Stat cell: muted caption label → value (text-stat-sm, tabular, foreground) → optional caption. */
function Money({
  label,
  value,
  hint
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-caption text-muted-foreground">{label}</span>
      {/* Wraps at spaces instead of «100 млн U…»: four columns get narrow on a small window. */}
      <span className="font-display text-stat-sm leading-tight tabular-nums [overflow-wrap:anywhere]">
        {value}
      </span>
      {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** «100 млн USD/год» on one line: the unit never wraps away from the amount. */
const PerUnit = ({
  amount,
  currency,
  unit
}: {
  amount: number
  currency: string
  unit: string
}): ReactElement => (
  <span className="whitespace-nowrap">
    <MoneyValue amount={amount} currency={currency} />
    {unit}
  </span>
)

function ProgressLine({
  label,
  warn,
  children
}: {
  label: string
  warn?: string
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex justify-between gap-3 text-caption tabular-nums">
        <span className="text-muted-foreground">{label}</span>
        {warn && <span className="text-warn">{warn}</span>}
      </span>
      {children}
    </div>
  )
}

/**
 * Money header in the language of the billing type: four equal stat cells with one type scale, no
 * highlighted values, and one full-width progress bar under the whole row (docs/design-system.md →
 * Списки и плитки). Empty values are phrases («ще немає оплат»), not zeros.
 */
export function MoneyHeader({ p, overdue }: { p: ProjectSummary; overdue: boolean }): ReactElement {
  const m = (n: number): string => fmtMoney(n, p.currency)
  const rateCell = (
    <Money
      label="Фактична ставка"
      value={
        p.trackedMinutes > 0 && p.effectiveRate ? (
          <PerUnit amount={p.effectiveRate} currency={p.currency} unit="/год" />
        ) : (
          <EmptyValue>ще немає годин</EmptyValue>
        )
      }
      hint={p.trackedMinutes > 0 ? `за ${fmtHours(p.trackedMinutes)}` : undefined}
    />
  )
  const paid = (
    <Money
      label="Оплачено"
      value={
        p.paidAmount > 0 ? (
          <MoneyValue amount={p.paidAmount} currency={p.currency} />
        ) : (
          <EmptyValue>ще немає оплат</EmptyValue>
        )
      }
    />
  )
  const owed = (
    <Money
      label={p.billing === 'fixed' ? 'Залишилося отримати' : 'Очікується'}
      value={<MoneyValue amount={p.outstandingAmount} currency={p.currency} />}
      hint={overdue ? <span className="text-warn">є прострочені оплати</span> : undefined}
    />
  )
  let cells: ReactNode
  let bar: ReactNode = null
  switch (p.billing) {
    case 'hourly': {
      cells = (
        <>
          <Money
            label="Зароблено"
            value={<MoneyValue amount={p.earnedAmount} currency={p.currency} />}
            hint={`${m(p.rate)}/год`}
          />
          {paid}
          {owed}
          <Money
            label="Години"
            value={fmtHours(p.trackedMinutes)}
            hint={p.budgetHours > 0 ? `з ${p.budgetHours} год бюджету` : undefined}
          />
        </>
      )
      if (p.budgetHours > 0) {
        const pct = Math.min(100, Math.round((p.trackedMinutes / 60 / p.budgetHours) * 100))
        const over = p.trackedMinutes - p.budgetHours * 60
        bar = (
          <ProgressLine
            label={`Відпрацьовано ${fmtHours(p.trackedMinutes)} з ${p.budgetHours} год · ${fmtPercent(pct)}`}
            warn={over > 0 ? `понад бюджет на ${fmtHours(over)}` : undefined}
          >
            <Meter value={p.trackedMinutes / 60} max={p.budgetHours} />
          </ProgressLine>
        )
      }
      break
    }
    case 'fixed':
      cells = (
        <>
          <Money
            label="Вартість проєкту"
            value={
              p.fixedPrice > 0 ? (
                <MoneyValue amount={p.fixedPrice} currency={p.currency} />
              ) : (
                <EmptyValue>Вартість не вказана</EmptyValue>
              )
            }
            hint={p.fixedPrice > 0 ? undefined : 'Вкажіть у режимі правки'}
          />
          {paid}
          {owed}
          {rateCell}
        </>
      )
      if (p.fixedPrice > 0) {
        // Old data can be overpaid: the bar and percent stop at 100%, the excess is said in words.
        const pct = Math.min(100, Math.round((p.paidAmount / p.fixedPrice) * 100))
        const over = p.paidAmount - p.fixedPrice
        bar = (
          <ProgressLine
            label={`Оплачено ${m(p.paidAmount)} з ${m(p.fixedPrice)} · ${fmtPercent(pct)}`}
            warn={over > 0 ? `переплата ${m(over)}` : undefined}
          >
            <Meter value={Math.min(p.paidAmount, p.fixedPrice)} max={p.fixedPrice} />
          </ProgressLine>
        )
      }
      break
    case 'retainer':
      cells = (
        <>
          <Money
            label="Ретейнер"
            value={<PerUnit amount={p.fixedPrice} currency={p.currency} unit="/міс" />}
            hint={`${p.retainerMonths} ${plural(p.retainerMonths, ['місяць', 'місяці', 'місяців'])}`}
          />
          {paid}
          {owed}
          {rateCell}
        </>
      )
      break
    default:
      cells = (
        <>
          <Money label="Години" value={fmtHours(p.trackedMinutes)} />
          <div className="col-span-3 self-center text-body text-muted-foreground">
            Проєкт без оплати — ведеться лише облік часу.
          </div>
        </>
      )
  }
  return (
    <Card className="mt-6 gap-5 p-6">
      <div className="grid grid-cols-4 gap-6">{cells}</div>
      {bar}
    </Card>
  )
}
