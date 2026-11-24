import type { BillingType, ProjectInput } from '@shared/domain/crm'
import { fmtMoney } from '@/lib/format'

/** Formats a per-currency sum map: "$1 200 · €300" or a dash. */
export function moneyMap(map: Partial<Record<string, number>>): string {
  const parts = Object.entries(map)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([cur, v]) => fmtMoney(v ?? 0, cur))
  return parts.length ? parts.join(' · ') : '—'
}

export const numberOrZero = (v: string): number => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Splits a client's default amount into the right project field for its billing type. */
export function amountPatch(
  billing: BillingType,
  amount: number
): Pick<ProjectInput, 'rate' | 'fixedPrice'> {
  if (billing === 'hourly') return { rate: amount, fixedPrice: 0 }
  if (billing === 'none') return { rate: 0, fixedPrice: 0 }
  return { rate: 0, fixedPrice: amount }
}
