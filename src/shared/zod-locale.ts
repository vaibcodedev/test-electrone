/**
 * One place for how validation errors read — used by main (rpc) and the renderer (forms, JSON import),
 * so both say «Назва: занадто довго — максимум 500 символів», never «Too big…» or «patch.jobTitle: …».
 */
import { z, ZodError } from 'zod'
import { uk } from 'zod/locales'

let configured = false

/** Ukrainian messages for zod, with the common cases in plain words. Idempotent. */
export function configureZod(): void {
  if (configured) return
  configured = true
  z.config(uk())
  z.config({
    customError: (issue) => {
      const fmt = (n: unknown): string => (typeof n === 'number' ? n.toLocaleString('uk-UA') : String(n))
      if (issue.code === 'too_big')
        return issue.origin === 'string'
          ? `занадто довго — максимум ${fmt(issue.maximum)} символів`
          : issue.origin === 'array'
            ? `забагато записів — максимум ${fmt(issue.maximum)}`
            : `забагато — максимум ${fmt(issue.maximum)}`
      if (issue.code === 'too_small')
        return issue.origin === 'string'
          ? Number(issue.minimum) <= 1
            ? 'не може бути порожнім'
            : `закоротко — мінімум ${fmt(issue.minimum)} символів`
          : issue.origin === 'array'
            ? 'потрібен хоча б один запис'
            : `замало — мінімум ${fmt(issue.minimum)}`
      if (issue.code === 'invalid_format' && issue.format === 'url') return 'не схоже на посилання'
      if (issue.code === 'invalid_format' && issue.format === 'email') return 'не схоже на пошту'
      // JSON import: «{ "questions": [...] }» instead of «[...]» or «{ "items": [...] }».
      if (issue.code === 'invalid_union' && !issue.path?.length)
        return 'очікується масив записів [ … ] або об’єкт { "items": [ … ] }'
      if (issue.code === 'invalid_type')
        return issue.input === undefined ? 'обов’язкове поле' : 'неправильний тип значення'
      return undefined
    }
  })
}

/** Human names for fields in validation errors. */
export const FIELD_LABEL: Record<string, string> = {
  amount: 'Сума',
  currency: 'Валюта',
  title: 'Назва',
  jobTitle: 'Назва вакансії',
  name: 'Назва',
  label: 'Назва',
  url: 'Посилання',
  email: 'Пошта',
  phone: 'Телефон',
  fixedPrice: 'Вартість проєкту',
  hourlyRate: 'Погодинна ставка',
  rate: 'Ставка',
  defaultRate: 'Звичайна ставка',
  feePercent: 'Комісія',
  fee: 'Комісія',
  received: 'Надійшло',
  budgetHours: 'Бюджет годин',
  minutes: 'Хвилини',
  durationMin: 'Тривалість',
  progress: 'Прогрес',
  rating: 'Рейтинг',
  dueAt: 'Строк',
  startAt: 'Початок',
  endAt: 'Кінець',
  startedAt: 'Початок',
  paidAt: 'Дата оплати',
  at: 'Дата',
  credits: 'Конекти',
  creditPrice: 'Ціна конекту',
  cost: 'Вартість',
  target: 'Ціль',
  salaryMin: 'Зарплата від',
  salaryMax: 'Зарплата до',
  question: 'Питання',
  answer: 'Відповідь',
  code: 'Код',
  body: 'Текст',
  text: 'Текст',
  content: 'Вміст',
  description: 'Опис',
  jobDescription: 'Опис вакансії',
  coverLetter: 'Супровідний лист',
  notes: 'Нотатки',
  note: 'Нотатка',
  summary: 'Підсумок',
  plan: 'План',
  howToCommunicate: 'Як спілкуватися',
  problem: 'Завдання клієнта',
  whatDone: 'Що зроблено',
  result: 'Результат',
  signs: 'Ознаки',
  action: 'Що робити',
  errorText: 'Текст помилки',
  cause: 'Причина',
  solution: 'Рішення',
  section: 'Розділ',
  companyName: 'Компанія',
  term: 'Слово',
  translation: 'Переклад',
  example: 'Приклад',
  items: 'Записи'
}

/** «Назва: занадто довго…»; inside a list (JSON import) «Запис 38 → Назва: …». */
export function describeZodError(e: ZodError): string {
  const first = e.issues[0]
  if (!first) return 'Некоректні дані'
  const path = first.path.filter((p) => p !== 'patch' && p !== 'input')
  const index = path.find((p): p is number => typeof p === 'number')
  const key = [...path].reverse().find((p): p is string => typeof p === 'string')
  const field = key ? (FIELD_LABEL[key] ?? 'Поле') : ''
  const where = [index !== undefined ? `Запис ${index + 1}` : '', field].filter(Boolean).join(' → ')
  return where ? `${where}: ${first.message}` : first.message
}
