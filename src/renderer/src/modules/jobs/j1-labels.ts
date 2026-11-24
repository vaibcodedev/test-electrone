import { format } from 'date-fns'
import type {
  ApplicationStatus,
  QuestionCategory,
  StageKind,
  StageStatus,
  WorkFormat
} from '@shared/domain/jobs'
import { fmtDay, fmtMoney, LOCALE, plural } from '@/lib/format'

export const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: 'Сохранено',
  applied: 'Отправлено',
  replied: 'Ответили',
  test: 'Тестовое',
  interview: 'Собеседование',
  offer: 'Оффер',
  accepted: 'Принял',
  rejected: 'Отказ',
  no_reply: 'Нет ответа',
  withdrawn: 'Отозвал'
}

/** Kanban columns in pipeline order. */
export const ACTIVE_APP_STATUSES: ApplicationStatus[] = ['saved', 'applied', 'replied', 'test', 'interview', 'offer']
/** Collapsed «Закрытые» lane. */
export const CLOSED_APP_STATUSES: ApplicationStatus[] = ['accepted', 'rejected', 'no_reply', 'withdrawn']

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  screening: 'Скрининг',
  technical: 'Техническое',
  test_task: 'Тестовое',
  hr: 'HR',
  final: 'Финальное',
  other: 'Этап'
}

/** Short form for cards: «Тех. собеседование». */
export const STAGE_KIND_SHORT: Record<StageKind, string> = {
  screening: 'Скрининг',
  technical: 'Тех. собеседование',
  test_task: 'Тестовое',
  hr: 'HR-интервью',
  final: 'Финальное',
  other: 'Этап'
}

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  planned: 'Запланирован',
  done: 'Прошёл',
  passed: 'Успешно',
  failed: 'Не прошёл',
  cancelled: 'Отменён'
}

export const STAGE_STATUS_VARIANT: Record<StageStatus, 'soft' | 'info' | 'success' | 'destructive' | 'outline'> = {
  planned: 'info',
  done: 'soft',
  passed: 'success',
  failed: 'destructive',
  cancelled: 'outline'
}

export const FORMAT_LABEL: Record<WorkFormat, string> = {
  remote: 'Удалённо',
  office: 'Офис',
  hybrid: 'Гибрид'
}

export const QUESTION_CATEGORY_LABEL: Record<QuestionCategory, string> = {
  technical: 'Технический',
  behavioral: 'Общий',
  company: 'О компании',
  salary: 'Зарплата',
  other: 'Другое'
}

export function daysSince(ts: number | null, now: number): number | null {
  if (!ts) return null
  return Math.max(0, Math.floor((now - ts) / 86_400_000))
}

export function agoLabel(days: number | null): string {
  if (days === null) return 'не отправлено'
  if (days === 0) return 'сегодня'
  return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`
}

/** «завтра 15:00», «12 дек 10:30». */
export function whenLabel(ts: number | null): string {
  if (!ts) return 'без даты'
  return `${fmtDay(ts)} ${format(ts, 'HH:mm', { locale: LOCALE })}`
}

export function salaryLabel(min: number | null, max: number | null, currency: string): string | null {
  if (min === null && max === null) return null
  const whole = (n: number): string => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n)
  const one = (n: number): string => {
    try {
      return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
    } catch {
      return fmtMoney(n, currency)
    }
  }
  if (min !== null && max !== null && min !== max) return `${whole(min)}–${one(max)}`
  if (min !== null && max === null) return `от ${one(min)}`
  if (min === null && max !== null) return `до ${one(max)}`
  return one(min!)
}
