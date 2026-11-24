import { COMPACT_FROM, fmtMoney, fmtMoneyCompact } from '@/lib/format'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * A money amount for stat tiles: big sums are shortened («55 млн USD») so they never overflow the tile,
 * the exact amount is in the tooltip. Small sums are shown as is. docs/design-system.md → Числа в тексте.
 */
export function MoneyValue({ amount, currency, sign = false }: { amount: number; currency: string; sign?: boolean }) {
  const prefix = sign && amount > 0 ? '+' : ''
  const short = `${prefix}${fmtMoneyCompact(amount, currency)}`
  if (Math.abs(amount) < COMPACT_FROM) return <span className="tabular-nums">{short}</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Focusable with a full label: the exact amount reaches keyboard and screen-reader users too. */}
        <span tabIndex={0} aria-label={`${prefix}${fmtMoney(amount, currency)}`} className="cursor-help rounded-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          {short}
        </span>
      </TooltipTrigger>
      <TooltipContent>{`${prefix}${fmtMoney(amount, currency)}`}</TooltipContent>
    </Tooltip>
  )
}
