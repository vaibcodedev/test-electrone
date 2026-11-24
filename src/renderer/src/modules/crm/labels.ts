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
  archived: 'В архиве'
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
  hourly: 'Почасово',
  fixed: 'Фикс',
  retainer: 'Абонемент'
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
