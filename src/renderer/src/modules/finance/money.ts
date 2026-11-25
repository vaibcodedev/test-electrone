import type { Currency } from '@shared/domain/crm'
import type { ExpenseCategory, MoneyByCurrency } from '@shared/domain/finance'

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

/** Sum of rows per currency (we never convert between currencies): `pick` returns [currency, amount]. */
export function sumByCurrency<T>(
  rows: readonly T[] | undefined,
  pick: (r: T) => readonly [Currency, number]
): MoneyByCurrency {
  const out: MoneyByCurrency = {}
  for (const r of rows ?? []) {
    const [c, v] = pick(r)
    out[c] = (out[c] ?? 0) + v
  }
  return out
}

/** a + b, currency by currency. */
export function addMoney(
  a: MoneyByCurrency | undefined,
  b: MoneyByCurrency | undefined
): MoneyByCurrency {
  const out: MoneyByCurrency = { ...a }
  for (const [c, v] of Object.entries(b ?? {}) as [Currency, number][]) out[c] = (out[c] ?? 0) + v
  return out
}

/** Exchange rate in the uk locale, up to 4 decimals: «41,5». */
export function fmtRate(rate: number): string {
  return rate.toLocaleString('uk-UA', { maximumFractionDigits: 4 })
}
