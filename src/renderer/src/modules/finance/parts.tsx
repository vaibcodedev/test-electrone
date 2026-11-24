import type { ReactNode } from 'react'
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
  subscription: 'Подписки',
  connects: 'Коннекты',
  software: 'Софт и сервисы',
  hardware: 'Техника',
  phone: 'Телефон',
  internet: 'Интернет',
  education: 'Обучение',
  taxes: 'Налоги',
  bank: 'Банк и комиссии',
  other: 'Другое'
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
  sign = false
}: {
  value: MoneyByCurrency | undefined
  className?: string
  emptyLabel?: string
  sign?: boolean
}) {
  const entries = moneyEntries(value)
  if (!entries.length) return <span className={className}>{emptyLabel}</span>
  return (
    <span className={cn('flex flex-col', className)}>
      {entries.map(([c, v]) => (
        <span key={c} className="tabular-nums">
          {sign && v > 0 ? '+' : ''}
          {fmtMoney(v, c)}
        </span>
      ))}
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
              aria-label="Предыдущий месяц"
              onClick={() => onChange(shiftMonth(month, -1))}
            >
              <ChevronLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Предыдущий месяц</TooltipContent>
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
              aria-label="Следующий месяц"
              onClick={() => onChange(shiftMonth(month, 1))}
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Следующий месяц</TooltipContent>
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
        <MoneyLines value={value} className="font-display text-[26px] leading-tight" />
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
    { to: '/finance', label: 'Обзор' },
    { to: '/finance/income', label: 'Доходы' },
    { to: '/finance/expenses', label: 'Подписки и расходы' },
    { to: '/finance/withdrawals', label: 'Выводы' }
  ]
  return (
    <div className="flex flex-wrap gap-1 rounded-full bg-surface p-1">
      {links.map((l) => (
        <Button
          key={l.to}
          asChild
          size="sm"
          variant="ghost"
          className={cn(
            'font-normal text-muted-foreground hover:bg-transparent hover:text-foreground',
            pathname === l.to &&
              'bg-ink font-medium text-ink-foreground hover:bg-ink hover:text-ink-foreground'
          )}
        >
          <Link to={{ pathname: l.to, search }}>{l.label}</Link>
        </Button>
      ))}
    </div>
  )
}
