import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { StatTile } from '@/components/common/stat-tile'
import { MoneyValue } from '@/components/common/money-value'
import { Link, useLocation } from 'react-router'
import { Check, ChevronLeft, ChevronRight, Plus, type LucideIcon } from 'lucide-react'
import type { MoneyByCurrency } from '@shared/domain/finance'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { moneyEntries } from './money'
import { currentMonth, monthLabel, shiftMonth } from './month'

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
}): ReactElement {
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

/** ← Листопад 2026 →; the middle button returns to the current month. */
export function MonthSwitcher({
  month,
  onChange
}: {
  month: string
  onChange: (month: string) => void
}): ReactElement {
  const isCurrent = month === currentMonth()
  const label = (
    <Button
      variant="soft"
      size="sm"
      className="min-w-36 font-medium"
      onClick={() => onChange(currentMonth())}
      disabled={isCurrent}
    >
      {monthLabel(month)}
    </Button>
  )
  return (
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
      {isCurrent ? (
        label
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{label}</TooltipTrigger>
          <TooltipContent>Повернутися до поточного місяця</TooltipContent>
        </Tooltip>
      )}
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
  )
}

/**
 * Month-summary tile: one line per currency, big sums shortened («250 тис. USD»). Without money it
 * says `empty` in words («цього місяця оплат немає»), never a lone «—» (docs/design-system.md →
 * Паттерны форм). `hint` explains a number, so it is dropped with the number; `warning` always shows.
 */
export function MoneyStatTile({
  value,
  empty,
  hint,
  warning,
  ...props
}: Omit<ComponentProps<typeof StatTile>, 'value'> & {
  value: MoneyByCurrency | undefined
  empty: string
  warning?: ReactNode
}): ReactElement {
  const hasMoney = moneyEntries(value).length > 0
  return (
    <StatTile
      {...props}
      hint={warning ?? (hasMoney ? hint : undefined)}
      value={
        hasMoney ? (
          <MoneyLines
            value={value}
            compact
            className="text-stat-sm leading-tight tracking-normal"
          />
        ) : (
          // A block of its own: inline, the phrase would sit on the tile's 28px headline line box.
          <span
            className={cn(
              'block font-sans text-body leading-snug font-normal tracking-normal',
              props.tone === 'ink' ? 'text-ink-muted' : 'text-muted-foreground'
            )}
          >
            {empty}
          </span>
        )
      }
    />
  )
}

/** Empty card: icon in a circle, one line, an optional action — centred in the card. */
export function CardState({
  text,
  action,
  done,
  icon: Icon = Plus
}: {
  text: string
  action?: ReactNode
  done?: boolean
  /** What the action does: «+» adds a record, another icon for a jump elsewhere. */
  icon?: LucideIcon
}): ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-2 text-center">
      <span
        className={cn(
          'grid size-9 place-items-center rounded-full',
          done ? 'bg-success/15 text-success' : 'bg-foreground/7 text-muted-foreground'
        )}
      >
        {done ? <Check className="size-4" /> : <Icon className="size-4" />}
      </span>
      <p className="max-w-64 text-body text-muted-foreground">{text}</p>
      {action}
    </div>
  )
}

const FINANCE_LINKS = [
  { to: '/finance', label: 'Огляд' },
  { to: '/finance/income', label: 'Доходи' },
  { to: '/finance/expenses', label: 'Підписки й витрати' },
  { to: '/finance/withdrawals', label: 'Виведення' }
]

/**
 * Links between finance pages that keep the selected month. Links, not Radix Tabs: there is no
 * TabsContent here, so aria-controls would point nowhere. The selected one looks like a selected
 * segment (docs/design-system.md → Переключатели): raised neutral, not inverted.
 */
export function FinanceNav(): ReactElement {
  const { pathname, search } = useLocation()
  return (
    <nav
      aria-label="Розділи фінансів"
      className="flex w-fit flex-wrap gap-1 rounded-full bg-surface p-1"
    >
      {FINANCE_LINKS.map((l) => (
        <Button
          key={l.to}
          asChild
          size="sm"
          variant="ghost"
          className="font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-sm aria-[current=page]:hover:bg-card dark:aria-[current=page]:bg-foreground/12 dark:aria-[current=page]:hover:bg-foreground/12"
        >
          <Link
            to={{ pathname: l.to, search }}
            aria-current={pathname === l.to ? 'page' : undefined}
          >
            {l.label}
          </Link>
        </Button>
      ))}
    </nav>
  )
}
