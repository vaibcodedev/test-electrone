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
  saved: 'Збережено',
  applied: 'Надіслано',
  replied: 'Відповіли',
  test: 'Тестове',
  interview: 'Співбесіда',
  offer: 'Офер',
  accepted: 'Прийняв',
  rejected: 'Відмова',
  no_reply: 'Немає відповіді',
  withdrawn: 'Відкликав'
}

/** Kanban columns in pipeline order. */
export const ACTIVE_APP_STATUSES: ApplicationStatus[] = ['saved', 'applied', 'replied', 'test', 'interview', 'offer']
/** Collapsed «Закрытые» lane. */
export const CLOSED_APP_STATUSES: ApplicationStatus[] = ['accepted', 'rejected', 'no_reply', 'withdrawn']

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  screening: 'Скринінг',
  technical: 'Технічна',
  test_task: 'Тестове',
  hr: 'HR',
  final: 'Фінальна',
  other: 'Етап'
}

/** Short form for cards: «Тех. собеседование». */
export const STAGE_KIND_SHORT: Record<StageKind, string> = {
  screening: 'Скринінг',
  technical: 'Тех. співбесіда',
  test_task: 'Тестове',
  hr: 'HR-інтерв’ю',
  final: 'Фінальна',
  other: 'Етап'
}

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  planned: 'Заплановано',
  done: 'Відбувся',
  passed: 'Успішно',
  failed: 'Не пройшов',
  cancelled: 'Скасовано'
}

export const STAGE_STATUS_VARIANT: Record<StageStatus, 'soft' | 'info' | 'success' | 'destructive' | 'outline'> = {
  planned: 'info',
  done: 'soft',
  passed: 'success',
  failed: 'destructive',
  cancelled: 'outline'
}

export const FORMAT_LABEL: Record<WorkFormat, string> = {
  remote: 'Віддалено',
  office: 'Офіс',
  hybrid: 'Гібрид'
}

export const QUESTION_CATEGORY_LABEL: Record<QuestionCategory, string> = {
  technical: 'Технічне',
  behavioral: 'Загальне',
  company: 'Про компанію',
  salary: 'Зарплата',
  other: 'Інше'
}

export { daysSince } from '@/lib/format'

export function agoLabel(days: number | null): string {
  if (days === null) return 'не надіслано'
  if (days === 0) return 'сьогодні'
  return `${days} ${plural(days, ['день', 'дні', 'днів'])} тому`
}

/** «завтра 15:00», «12 дек 10:30». */
export function whenLabel(ts: number | null): string {
  if (!ts) return 'без дати'
  return `${fmtDay(ts)} ${format(ts, 'HH:mm', { locale: LOCALE })}`
}

export function salaryLabel(min: number | null, max: number | null, currency: string): string | null {
  if (min === null && max === null) return null
  const whole = (n: number): string => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n)
  const one = (n: number): string => {
    try {
      return new Intl.NumberFormat('uk-UA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
    } catch {
      return fmtMoney(n, currency)
    }
  }
  if (min !== null && max !== null && min !== max) return `${whole(min)}–${one(max)}`
  if (min !== null && max === null) return `від ${one(min)}`
  if (min === null && max !== null) return `до ${one(max)}`
  return one(min!)
}
