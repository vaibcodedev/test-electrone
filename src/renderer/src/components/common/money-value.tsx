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
        <span className="cursor-help tabular-nums">{short}</span>
      </TooltipTrigger>
      <TooltipContent>{`${prefix}${fmtMoney(amount, currency)}`}</TooltipContent>
    </Tooltip>
  )
}
