import type { QuestionCategory, StageKind } from '@shared/domain/jobs'

export const QUESTION_CATEGORY_LABEL: Record<QuestionCategory, string> = {
  technical: 'Технические',
  behavioral: 'Общие / о себе',
  company: 'О компании',
  salary: 'Зарплата',
  other: 'Другое'
}

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  screening: 'Скрининг',
  technical: 'Техническое',
  test_task: 'Тестовое',
  hr: 'HR',
  final: 'Финальное',
  other: 'Этап'
}

export const LANG_LABEL = { ru: 'RU', uk: 'UK', en: 'EN' } as const

/** Mon-first weekday labels; value = JS getDay() (0 = Sunday). */
export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Пн' },
  { value: 2, label: 'Вт' },
  { value: 3, label: 'Ср' },
  { value: 4, label: 'Чт' },
  { value: 5, label: 'Пт' },
  { value: 6, label: 'Сб' },
  { value: 0, label: 'Вс' }
]

export const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Лёгкий', 2: 'Средний', 3: 'Сложный' }
