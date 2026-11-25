import type { ReactNode, ReactElement } from 'react'
import type { ProjectSummary } from '@shared/domain/crm'
import { MoneyValue } from '@/components/common/money-value'
import { ProgressLine } from '@/components/common/progress-line'
import { useDetailMode } from '@/components/common/detail-mode-context'
import { fmtHours, fmtMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  budgetShareLabel,
  NOT_TRACKED,
  paidShareLabel,
  PRICE_MISSING,
  RETAINER_MISSING,
  retainerMonthsLabel
} from './labels'
import { EmptyValue } from '@/components/common/empty-value'
import { PROJECT_AMOUNT_ID } from './project-terms'

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
      <span className="font-display text-stat-sm leading-tight tabular-nums wrap-anywhere">
        {value}
      </span>
      {/* div, not span: the hint can be a «Вказати…» button. */}
      {hint && <div className="text-caption text-muted-foreground">{hint}</div>}
    </div>
  )
}

/** «100 млн USD/год» on one line: the unit never wraps away from the amount and is quieter. */
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
    <span className="font-sans text-body text-muted-foreground">{unit}</span>
  </span>
)

/**
 * Money header in the language of the billing type: four equal stat cells with one type scale, no
 * highlighted values, and one full-width progress bar under the whole row (docs/design-system.md →
 * Списки и плитки). Empty values are phrases («ще немає оплат»), not zeros. «Без оплати» has no header:
 * its hours are in «Облік часу».
 */
export function MoneyHeader({ p, overdue }: { p: ProjectSummary; overdue: boolean }): ReactElement {
  const mode = useDetailMode()
  const m = (n: number): string => fmtMoney(n, p.currency)
  // A missing amount is a step to take, not grey instructions: «Вказати…» switches the record to editing
  // and focuses the field in the right column (it mounts with editing). The card is surface → subtle.
  const fill = (label: string): ReactNode =>
    !mode.editing && (
      <Button
        variant="subtle"
        size="xs"
        onClick={() => {
          mode.setEditing(true)
          requestAnimationFrame(() => document.getElementById(PROJECT_AMOUNT_ID)?.focus())
        }}
      >
        {label}
      </Button>
    )
  const budget = fmtHours(p.budgetHours * 60)
  const hours =
    p.trackedMinutes > 0 ? fmtHours(p.trackedMinutes) : <EmptyValue>{NOT_TRACKED}</EmptyValue>
  // summaries.ts gives no rate under 30 minutes or without earned money: each reason gets its own phrase.
  // A retainer that hasn't started has its amount, just nothing billed yet — not «суму не вказано».
  const rateCell = (
    <Money
      label="Фактична ставка"
      value={
        p.trackedMinutes === 0 ? (
          <EmptyValue>ще немає годин</EmptyValue>
        ) : p.effectiveRate ? (
          <PerUnit amount={p.effectiveRate} currency={p.currency} unit="/год" />
        ) : p.fixedPrice === 0 ? (
          <EmptyValue>
            {p.billing === 'retainer' ? 'рахується від суми' : 'рахується від вартості'}
          </EmptyValue>
        ) : p.earnedAmount === 0 ? (
          <EmptyValue>ще не нараховано</EmptyValue>
        ) : (
          <EmptyValue>замало часу</EmptyValue>
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
      value={
        p.outstandingAmount > 0 ? (
          <MoneyValue amount={p.outstandingAmount} currency={p.currency} />
        ) : (
          <EmptyValue>
            {p.billing === 'fixed' && p.fixedPrice === 0
              ? 'залежить від вартості'
              : p.billing === 'fixed' && p.paidAmount >= p.fixedPrice
                ? 'усе отримано'
                : 'нічого не чекаємо'}
          </EmptyValue>
        )
      }
      hint={overdue ? <span className="text-warn">є прострочені оплати</span> : undefined}
    />
  )
  let cells: ReactNode = null
  let bar: ReactNode = null
  switch (p.billing) {
    case 'hourly': {
      cells = (
        <>
          <Money
            label="Зароблено"
            value={
              p.rate === 0 ? (
                <EmptyValue>ставку не вказано</EmptyValue>
              ) : p.earnedAmount > 0 ? (
                <MoneyValue amount={p.earnedAmount} currency={p.currency} />
              ) : (
                <EmptyValue>ще не зароблено</EmptyValue>
              )
            }
            hint={p.rate === 0 ? fill('Вказати ставку') : `${m(p.rate)}/год`}
          />
          {paid}
          {owed}
          <Money
            label="Години"
            value={hours}
            hint={p.budgetHours > 0 ? `з ${budget} бюджету` : undefined}
          />
        </>
      )
      if (p.budgetHours > 0) {
        // The hours and the budget are in the cell above: the caption adds only the share.
        const over = p.trackedMinutes - p.budgetHours * 60
        bar = (
          <ProgressLine
            continuous
            value={p.trackedMinutes}
            total={p.budgetHours * 60}
            label={budgetShareLabel(p)}
            warn={over > 0 ? `понад бюджет на ${fmtHours(over)}` : undefined}
          />
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
                <EmptyValue>{PRICE_MISSING}</EmptyValue>
              )
            }
            hint={p.fixedPrice > 0 ? undefined : fill('Вказати вартість')}
          />
          {paid}
          {owed}
          {rateCell}
        </>
      )
      if (p.fixedPrice > 0) {
        // Both sums are in the cells above: the caption adds only the percent. Old data can be overpaid:
        // the bar and percent stop at 100%, the excess is said in words.
        const over = p.paidAmount - p.fixedPrice
        bar = (
          <ProgressLine
            continuous
            value={Math.min(p.paidAmount, p.fixedPrice)}
            total={p.fixedPrice}
            label={paidShareLabel(p)}
            warn={over > 0 ? `переплата ${m(over)}` : undefined}
          />
        )
      }
      break
    case 'retainer':
      cells = (
        <>
          <Money
            label="Ретейнер"
            value={
              p.fixedPrice > 0 ? (
                <PerUnit amount={p.fixedPrice} currency={p.currency} unit="/міс" />
              ) : (
                <EmptyValue>{RETAINER_MISSING}</EmptyValue>
              )
            }
            hint={
              p.fixedPrice > 0
                ? p.retainerMonths > 0
                  ? retainerMonthsLabel(p.retainerMonths)
                  : 'ще не почався'
                : fill('Вказати суму')
            }
          />
          {paid}
          {owed}
          {rateCell}
        </>
      )
      break
  }
  return (
    <Card className="mt-6 gap-5 p-6">
      <div className="grid grid-cols-4 gap-6">{cells}</div>
      {bar}
    </Card>
  )
}
