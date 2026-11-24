import type {
  BillingType,
  ClientStatus,
  Currency,
  PaymentStatus,
  ProjectStatus
} from '@shared/domain/crm'

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  lead: 'Потенциальный',
  active: 'Активный',
  paused: 'На паузе',
  archived: 'В архиве',
  avoid: 'Не работать'
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  lead: 'Лид',
  active: 'В работе',
  paused: 'На паузе',
  done: 'Завершён',
  cancelled: 'Отменён'
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
  fixed: 'Фикс за проект',
  hourly: 'Почасовая',
  retainer: 'Абонемент',
  none: 'Без оплаты'
}

/** Copy for the billing picker and the amount field that follows the chosen type. */
export const BILLING_INFO: Record<
  BillingType,
  { title: string; description: string; amountLabel: string | null }
> = {
  fixed: {
    title: 'Фикс за проект',
    description: 'Одна цена, оплата этапами',
    amountLabel: 'Стоимость проекта'
  },
  hourly: {
    title: 'Почасовая',
    description: 'Часы × ставка',
    amountLabel: 'Ставка в час'
  },
  retainer: {
    title: 'Абонемент',
    description: 'Фиксированная сумма в месяц',
    amountLabel: 'Абонемент в месяц'
  },
  none: {
    title: 'Без оплаты',
    description: 'Свой проект, только учёт времени',
    amountLabel: null
  }
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  expected: 'Ожидается',
  invoiced: 'Счёт выставлен',
  paid: 'Оплачено',
  cancelled: 'Отменено'
}

export const CURRENCY_SIGN: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  UAH: '₴',
  PLN: 'zł',
  GBP: '£'
}
