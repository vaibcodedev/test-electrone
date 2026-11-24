import type { QuestionCategory, StageKind } from '@shared/domain/jobs'

export const QUESTION_CATEGORY_LABEL: Record<QuestionCategory, string> = {
  technical: 'Технічні',
  behavioral: 'Про себе',
  company: 'Про компанію',
  salary: 'Зарплата й умови',
  other: 'Інше'
}

export const QUESTION_GROUP_LABEL = { technical: 'Технічні', nontechnical: 'Нетехнічні' } as const

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  screening: 'Скринінг',
  technical: 'Технічна',
  test_task: 'Тестове',
  hr: 'HR',
  final: 'Фінальна',
  other: 'Етап'
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
  { value: 0, label: 'Нд' }
]

export const DIFFICULTY_LABEL: Record<number, string> = { 1: 'Легке', 2: 'Середнє', 3: 'Складне' }
