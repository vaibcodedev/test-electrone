import type { BillingType, ProjectInput } from '@shared/domain/crm'
import { fmtMoney } from '@/lib/format'

/** Formats a per-currency sum map: "$1 200 · €300" or a dash. */
export function moneyMap(map: Partial<Record<string, number>>): string {
  const parts = Object.entries(map)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([cur, v]) => fmtMoney(v ?? 0, cur))
  return parts.length ? parts.join(' · ') : '—'
}

/** Accepts "5000", "5 000", "5 000,5" (grouped by fmtAmount or typed by hand). */
export const numberOrZero = (v: string): number => {
  const n = Number(v.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** String form state ↔ NumberInput value: '' ↔ null. */
export const draftToNumber = (s: string): number | null => {
  const t = s.replace(/\s/g, '').replace(',', '.')
  return t === '' || Number.isNaN(Number(t)) ? null : Number(t)
}
export const numberToDraft = (v: number | null): string => (v === null ? '' : String(v))

/** Groups thousands for an amount input (on blur), so 5 000 000 vs 5 000 is obvious. */
export const fmtAmount = (n: number): string =>
  n > 0 ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(n) : ''

/** Splits a client's default amount into the right project field for its billing type. */
export function amountPatch(
  billing: BillingType,
  amount: number
): Pick<ProjectInput, 'rate' | 'fixedPrice'> {
  if (billing === 'hourly') return { rate: amount, fixedPrice: 0 }
  if (billing === 'none') return { rate: 0, fixedPrice: 0 }
  return { rate: 0, fixedPrice: amount }
}
