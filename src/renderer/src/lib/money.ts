import type { Currency } from '@shared/domain/crm'
import type { MoneyByCurrency } from '@shared/domain/finance'

/** Non-zero entries of a per-currency amount, largest first. */
export function moneyEntries(m: MoneyByCurrency | undefined): [Currency, number][] {
  return (Object.entries(m ?? {}) as [Currency, number][])
    .filter(([, v]) => Math.abs(v ?? 0) >= 0.005)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
}
