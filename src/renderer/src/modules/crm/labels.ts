import type {
  BillingType,
  ClientStatus,
  Currency,
  PaymentStatus,
  ProjectStatus
} from '@shared/domain/crm'

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  lead: 'Потенційний',
  active: 'Активний',
  paused: 'На паузі',
  archived: 'В архіві',
  avoid: 'Не працювати'
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: 'Лід',
  active: 'У роботі',
  paused: 'На паузі',
  done: 'Завершено',
  cancelled: 'Скасовано'
}

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

/** Copy for the billing picker and the amount field that follows the chosen type. */
export const BILLING_INFO: Record<
  BillingType,
  { title: string; description: string; amountLabel: string | null }
> = {
  fixed: {
    title: 'Фіксована ціна',
    description: 'Одна ціна, оплата етапами',
    amountLabel: 'Вартість проєкту'
  },
  hourly: {
    title: 'Погодинно',
    description: 'Години × ставка',
    amountLabel: 'Ставка за годину'
  },
  retainer: {
    title: 'Ретейнер',
    description: 'Фіксована сума на місяць',
    amountLabel: 'Ретейнер на місяць'
  },
  none: {
    title: 'Без оплати',
    description: 'Власний проєкт, лише облік часу',
    amountLabel: null
  }
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
export const DUE_BEFORE_START = 'Кінцева дата раніша за початок'
