import { fmtPercent, plural } from '@/lib/format'
import type {
  BillingType,
  ClientStatus,
  Currency,
  PaymentStatus,
  ProjectStatus,
  ProjectSummary
} from '@shared/domain/crm'

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  lead: 'Потенційний',
  active: 'Активний',
  paused: 'На паузі',
  archived: 'В архіві',
  avoid: 'Не працювати'
}

/** One map for main (search, pins, trash) and the screens: a local copy drifted from it before. */
export { PROJECT_STATUS_LABEL } from '@shared/domain/crm'

type StatusBadge = 'soft' | 'info' | 'warn' | 'success'

/** Status badge colours: lime stays the screen accent (docs/design-system.md → Бейджи). */
export const PROJECT_STATUS_BADGE: Record<ProjectStatus, StatusBadge> = {
  lead: 'soft',
  active: 'info',
  paused: 'warn',
  done: 'success',
  cancelled: 'soft'
}

/** Client card badge; «Активний» is the usual state and gets none, «Не працювати» has AvoidBadge. */
export const CLIENT_STATUS_BADGE: Partial<Record<ClientStatus, StatusBadge>> = {
  lead: 'info',
  paused: 'warn',
  archived: 'soft'
}

export const BILLING_LABEL: Record<BillingType, string> = {
  fixed: 'Фіксована ціна',
  hourly: 'Погодинно',
  retainer: 'Ретейнер',
  none: 'Без оплати'
}

/** One-line hint per billing type in the picker: short enough to never wrap next to the label. */
export const BILLING_HINT: Record<BillingType, string> = {
  fixed: 'за весь проєкт',
  hourly: 'ставка за годину',
  retainer: 'щомісячна сума',
  none: 'лише облік часу'
}

/** Label of the amount field that follows the billing type; «Без оплати» has none. */
export const BILLING_AMOUNT_LABEL: Record<BillingType, string | null> = {
  fixed: 'Вартість проєкту',
  hourly: 'Ставка за годину',
  retainer: 'Ретейнер на місяць',
  none: null
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  expected: 'Очікується',
  invoiced: 'Рахунок виставлено',
  paid: 'Оплачено',
  cancelled: 'Скасовано'
}

export const CURRENCY_SIGN: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  UAH: '₴',
  PLN: 'zł',
  GBP: '£'
}

/** «No platform» in filters, selects and the record view. */
export const NO_PLATFORM = 'Без платформи'

/** A deadline / end date before the start date (project, stage). */
export const DUE_BEFORE_START = 'Кінець раніше за початок — виправте дату'

/** Empty money and time in the project header and in project rows: the same words in both places. */
export const PRICE_MISSING = 'вартість не вказана'
export const RETAINER_MISSING = 'суму не вказано'
export const NOT_TRACKED = 'ще не відстежено'

/** Share of a total for a bar caption, capped at 100%: the excess is said in words next to it. */
const share = (value: number, total: number): string =>
  fmtPercent(Math.min(100, Math.round((value / total) * 100)))

/** «Оплачено 50%» — the bar of a fixed price (fixedPrice > 0). */
export const paidShareLabel = (p: ProjectSummary): string =>
  `Оплачено ${share(p.paidAmount, p.fixedPrice)}`

/** «Відпрацьовано 15% бюджету» — the bar of an hourly budget (budgetHours > 0). */
export const budgetShareLabel = (p: ProjectSummary): string =>
  `Відпрацьовано ${share(p.trackedMinutes, p.budgetHours * 60)} бюджету`

/** «нараховано за 3 місяці» — retainer months billed so far. */
export function retainerMonthsLabel(n: number): string {
  return `нараховано за ${n} ${plural(n, ['місяць', 'місяці', 'місяців'])}`
}
