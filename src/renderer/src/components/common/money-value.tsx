import type { ReactElement } from 'react'
import type { MoneyByCurrency } from '@shared/domain/finance'
import { COMPACT_FROM, fmtMoney, fmtMoneyCompact } from '@/lib/format'
import { moneyEntries } from '@/lib/money'

// eslint-disable-next-line react-refresh/only-export-components -- modules import it next to MoneyLines
export { moneyEntries }
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Never wider than its tile: a long sum ends with «…» (the exact amount is in the tooltip). */
const FIT = 'inline-block max-w-full truncate align-bottom tabular-nums'

/**
 * A money amount for stat tiles: big sums are shortened («55 млн USD») so they never overflow the tile,
 * the exact amount is in the tooltip. Small sums are shown as is. docs/design-system.md → Числа в тексте.
 */
export function MoneyValue({ amount, currency, sign = false }: { amount: number; currency: string; sign?: boolean }) {
  const prefix = sign && amount > 0 ? '+' : ''
  const short = `${prefix}${fmtMoneyCompact(amount, currency)}`
  if (Math.abs(amount) < COMPACT_FROM) return <span className={FIT}>{short}</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Focusable with a full label: the exact amount reaches keyboard and screen-reader users too. */}
        <span
          tabIndex={0}
          aria-label={`${prefix}${fmtMoney(amount, currency)}`}
          className={cn(FIT, 'cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        >
          {short}
        </span>
      </TooltipTrigger>
      <TooltipContent>{`${prefix}${fmtMoney(amount, currency)}`}</TooltipContent>
    </Tooltip>
  )
}

type MoneyLinesProps = {
  value: MoneyByCurrency | undefined
  className?: string
  sign?: boolean
} & (
  | {
      /**
       * Stat tiles: big sums shortened («55 млн USD», exact amount in a tooltip). A tile without data
       * says so in words («ще немає виплат»), never «—», so the phrase is required here.
       */
      compact: true
      emptyLabel: string
    }
  | { compact?: false; emptyLabel?: string }
)

/** Money per currency, one line each (we never convert between currencies). */
export function MoneyLines({ value, className, emptyLabel = '—', sign = false, compact = false }: MoneyLinesProps): ReactElement {
  const entries = moneyEntries(value)
  if (!entries.length)
    return (
      <span className={cn(className, compact && 'font-sans text-body font-normal tracking-normal text-muted-foreground')}>
        {emptyLabel}
      </span>
    )
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
