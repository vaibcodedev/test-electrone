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

export const PROJECT_STATUS_BADGE: Record<
  ProjectStatus,
  'lime' | 'soft' | 'warn' | 'success' | 'outline'
> = {
  lead: 'outline',
  active: 'lime',
  paused: 'warn',
  done: 'success',
  cancelled: 'soft'
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
