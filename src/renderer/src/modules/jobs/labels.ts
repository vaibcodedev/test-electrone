import { format } from 'date-fns'
import {
  STAGE_KINDS,
  type ApplicationStatus,
  type QuestionCategory,
  type StageKind,
  type StageStatus,
  type WorkFormat
} from '@shared/domain/jobs'
import { COMPACT_FROM, fmtDay, fmtMoney, fmtMoneyCompact, LOCALE, plural } from '@/lib/format'

export const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: 'Збережено',
  applied: 'Надіслано',
  replied: 'Відповіли',
  test: 'Тестове',
  interview: 'Співбесіда',
  offer: 'Офер',
  accepted: 'Прийнято',
  rejected: 'Відмова',
  no_reply: 'Немає відповіді',
  withdrawn: 'Відкликано'
}

/** Kanban columns in pipeline order. */
export const ACTIVE_APP_STATUSES: ApplicationStatus[] = ['saved', 'applied', 'replied', 'test', 'interview', 'offer']
/** Collapsed «Закриті» lane. */
export const CLOSED_APP_STATUSES: ApplicationStatus[] = ['accepted', 'rejected', 'no_reply', 'withdrawn']

/** Status badge in repeated rows: lime stays the screen's accent, so a good outcome is `success`. */
export function appStatusVariant(status: ApplicationStatus): 'success' | 'outline' | 'soft' {
  if (status === 'offer' || status === 'accepted') return 'success'
  return CLOSED_APP_STATUSES.includes(status) ? 'outline' : 'soft'
}

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  screening: 'Скринінг',
  technical: 'Технічна',
  test_task: 'Тестове',
  hr: 'HR',
  final: 'Фінальна',
  other: 'Етап'
}

export const KIND_OPTIONS = STAGE_KINDS.map((k) => ({ value: k, label: STAGE_KIND_LABEL[k] }))

/** Short form for cards: «Тех. співбесіда». */
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
  done: 'Відбулося',
  passed: 'Пройдено',
  failed: 'Не пройдено',
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

/** One name per category on every screen (bank, trainer, vacancy and company). */
export const QUESTION_CATEGORY_LABEL: Record<QuestionCategory, string> = {
  technical: 'Технічні',
  behavioral: 'Про себе',
  company: 'Про компанію',
  salary: 'Зарплата й умови',
  other: 'Інше'
}

export const QUESTION_GROUP_LABEL = { technical: 'Технічні', nontechnical: 'Нетехнічні' } as const

/** Words, not codes: «UK» read as «Велика Британія». */
export const LANG_LABEL = { ru: 'Рос', uk: 'Укр', en: 'Англ' } as const

/** Mon-first weekday labels; value = JS getDay() (0 = Sunday). */
export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Нд' }
]

export const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Легке', 2: 'Середнє', 3: 'Складне' }

/** «1 день», «3 дні», «12 днів». */
export const daysWord = (n: number): string => `${n} ${plural(n, ['день', 'дні', 'днів'])}`

export function agoLabel(days: number | null): string {
  if (days === null) return 'не надіслано'
  if (days === 0) return 'сьогодні'
  return `${daysWord(days)} тому`
}

/** «завтра 15:00», «12 грудня 10:30». */
export function whenLabel(ts: number | null): string {
  if (!ts) return 'без дати'
  return `${fmtDay(ts)} ${format(ts, 'HH:mm', { locale: LOCALE })}`
}

/**
 * «80 000–100 000 USD», «від 3 000 USD». `compact` shortens large amounts for badges and table cells
 * («9–10 млн USD») — the exact range goes into a tooltip or title next to it.
 */
export function salaryLabel(min: number | null, max: number | null, currency: string, compact = false): string | null {
  if (min === null && max === null) return null
  const big = compact && Math.max(min ?? 0, max ?? 0) >= COMPACT_FROM
  const whole = (n: number): string =>
    new Intl.NumberFormat('uk-UA', { maximumFractionDigits: big ? 1 : 0, notation: big ? 'compact' : 'standard' }).format(n)
  const one = (n: number): string => {
    if (big) return fmtMoneyCompact(n, currency)
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
