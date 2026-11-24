import type { ReactNode } from 'react'
import { MoneyValue } from '@/components/common/money-value'
import { Link, useLocation } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Currency } from '@shared/domain/crm'
import type { ExpenseCategory, MoneyByCurrency } from '@shared/domain/finance'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { currentMonth, monthLabel, shiftMonth } from './month'

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  subscription: 'Підписки',
  connects: 'Конекти',
  software: 'Софт і сервіси',
  hardware: 'Техніка',
  phone: 'Телефон',
  internet: 'Інтернет',
  education: 'Навчання',
  taxes: 'Податки',
  bank: 'Банк і комісії',
  other: 'Інше'
}

/** Non-zero entries of a per-currency amount, largest first. */
export function moneyEntries(m: MoneyByCurrency | undefined): [Currency, number][] {
  return (Object.entries(m ?? {}) as [Currency, number][])
    .filter(([, v]) => Math.abs(v ?? 0) >= 0.005)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
}

/** Money per currency, one line each (we never convert between currencies). */
export function MoneyLines({
  value,
  className,
  emptyLabel = '—',
  sign = false,
  compact = false
}: {
  value: MoneyByCurrency | undefined
  className?: string
  emptyLabel?: string
  sign?: boolean
  /** Stat tiles: shorten big sums («55 млн USD»), exact amount in a tooltip. */
  compact?: boolean
}) {
  const entries = moneyEntries(value)
  if (!entries.length) return <span className={className}>{emptyLabel}</span>
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      {entries.map(([c, v]) =>
        compact ? (
          <MoneyValue key={c} amount={v} currency={c} sign={sign} />
        ) : (
          <span key={c} className="tabular-nums">
            {sign && v > 0 ? '+' : ''}
            {fmtMoney(v, c)}
          </span>
        )
      )}
    </span>
  )
}

/** ← Ноябрь 2026 → with «Этот месяц» reset. */
export function MonthSwitcher({
  month,
  onChange
}: {
  month: string
  onChange: (month: string) => void
}) {
  const isCurrent = month === currentMonth()
  return (
    <div className="flex items-center gap-2">
      <ButtonGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="soft"
              size="icon-sm"
              aria-label="Попередній місяць"
              onClick={() => onChange(shiftMonth(month, -1))}
            >
              <ChevronLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Попередній місяць</TooltipContent>
        </Tooltip>
        <Button
          variant="soft"
          size="sm"
          className="min-w-36 font-medium"
          onClick={() => onChange(currentMonth())}
          disabled={isCurrent}
        >
          {monthLabel(month)}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="soft"
              size="icon-sm"
              aria-label="Наступний місяць"
              onClick={() => onChange(shiftMonth(month, 1))}
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Наступний місяць</TooltipContent>
        </Tooltip>
      </ButtonGroup>
    </div>
  )
}

/** Big-number tile for the month summary. */
export function StatTile({
  title,
  value,
  hint,
  ink = false,
  className
}: {
  title: string
  value: MoneyByCurrency | undefined
  hint?: ReactNode
  ink?: boolean
  className?: string
}) {
  return (
    <Card className={cn('gap-2', ink && 'bg-ink text-ink-foreground', className)}>
      <CardHeader>
        <CardTitle className={cn(ink && 'text-ink-muted')}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <MoneyLines value={value} compact className="font-display text-stat-sm leading-tight" />
        {hint && (
          <div className={cn('text-caption', ink ? 'text-ink-muted' : 'text-muted-foreground')}>
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Tabs between finance pages that keep the selected month. */
export function FinanceNav() {
  const { pathname, search } = useLocation()
  const links = [
    { to: '/finance', label: 'Огляд' },
    { to: '/finance/income', label: 'Доходи' },
    { to: '/finance/expenses', label: 'Підписки й витрати' },
    { to: '/finance/withdrawals', label: 'Виведення' }
  ]
  return (
    // w-fit: the track follows the tabs instead of stretching across the page.
    <div className="flex w-fit flex-wrap gap-1 rounded-full bg-surface p-1">
      {links.map((l) => (
        <Button
          key={l.to}
          asChild
          size="sm"
          variant="ghost"
          className={cn(
            'font-normal text-muted-foreground hover:bg-transparent hover:text-foreground',
            // Same as a selected segment (docs/design-system.md → Переключатели): raised neutral, not inverted.
            pathname === l.to &&
              'bg-card font-medium text-foreground shadow-sm hover:bg-card dark:bg-foreground/12 dark:hover:bg-foreground/12'
          )}
        >
          <Link to={{ pathname: l.to, search }}>{l.label}</Link>
        </Button>
      ))}
    </div>
  )
}
