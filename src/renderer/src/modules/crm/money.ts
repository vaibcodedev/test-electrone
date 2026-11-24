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
