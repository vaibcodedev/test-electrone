import { projectInputSchema, type BillingType, type ProjectInput } from '@shared/domain/crm'
import { fieldMax } from '@shared/domain/limits'

/** String form state ↔ NumberInput value: '' ↔ null. */
export const draftToNumber = (s: string): number | null => {
  const t = s.replace(/\s/g, '').replace(',', '.')
  return t === '' || Number.isNaN(Number(t)) ? null : Number(t)
}
export const numberToDraft = (v: number | null): string => (v === null ? '' : String(v))

const RATE_MAX = fieldMax(projectInputSchema.shape.rate)
const PRICE_MAX = fieldMax(projectInputSchema.shape.fixedPrice)

/**
 * Splits a client's default amount (or the project's current amount when billing changes) into the right
 * project field for its billing type. An amount that can't be an hourly rate (a 500 000 fixed price)
 * becomes 0 instead of a value the server would reject.
 */
export function amountPatch(
  billing: BillingType,
  amount: number
): Pick<ProjectInput, 'rate' | 'fixedPrice'> {
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 0
  if (billing === 'hourly') return { rate: safe <= RATE_MAX ? safe : 0, fixedPrice: 0 }
  if (billing === 'none') return { rate: 0, fixedPrice: 0 }
  return { rate: 0, fixedPrice: safe <= PRICE_MAX ? safe : 0 }
}
