/**
 * One place for how validation errors read — used by main (rpc) and the renderer (forms, JSON import),
 * so both say «Назва: занадто довго — максимум 500 символів», never «Too big…» or «patch.jobTitle: …».
 */
import { z, ZodError } from 'zod'
import { uk } from 'zod/locales'

let configured = false

const DECIMALS: Record<number, string> = {
  1: 'одного знака',
  2: 'двох знаків',
  3: 'трьох знаків',
  4: 'чотирьох знаків'
}

/** Decimal places of a fractional step (0.1 → 1, 0.01 → 2); 0 for a whole step. */
function decimalPlaces(step: number): number {
  if (!(step > 0 && step < 1)) return 0
  const [mantissa, exp] = String(step).split('e-')
  return (mantissa.split('.')[1]?.length ?? 0) + (exp ? Number(exp) : 0)
}

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
      // A rating of step 0,1 given 4,99: say it in decimals, not «must be a multiple of 0.1».
      if (issue.code === 'not_multiple_of') {
        const places = decimalPlaces(Number(issue.divisor))
        return places
          ? `не більше ${DECIMALS[places] ?? `${places} знаків`} після коми`
          : `має ділитися на ${fmt(issue.divisor)}`
      }
      if (issue.code === 'invalid_format' && issue.format === 'url') return 'не схоже на посилання'
      if (issue.code === 'invalid_format' && issue.format === 'email') return 'не схоже на email'
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
  email: 'Email',
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
  clientRating: 'Рейтинг',
  clientSpent: 'Витрачено',
  totalSpent: 'Витрачено',
  clientHireRate: 'Найм',
  hireRate: 'Найм',
  bidAmount: 'Сума',
  proposalsOnJob: 'Відгуків на вакансію',
  dueAt: 'Термін',
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
  items: 'Записи',
  tags: 'Мітки',
  screenshot: 'Скриншот',
  selection: 'Виділений текст',
  company: 'Компанія',
  kind: 'Тип'
}

/** «Назва: занадто довго…»; inside a list (JSON import) «Запис 38 → Назва: …». */
export function describeZodError(e: ZodError): string {
  const first = e.issues[0]
  if (!first) return 'Некоректні дані'
  const path = first.path.filter((p) => p !== 'patch' && p !== 'input')
  // «Запис N» is a record of a list ([37, 'title'], ['items', 37, 'title'], an imported [37]), not a value
  // of an array field: ['tags', 0] is «Мітки: …».
  const at = path.findIndex((p) => typeof p === 'number')
  const valueOfField = at > 0 && at === path.length - 1
  const index = at >= 0 && !valueOfField ? (path[at] as number) : undefined
  const key = [...path].reverse().find((p): p is string => typeof p === 'string')
  const field = key ? (FIELD_LABEL[key] ?? 'Поле') : ''
  const where = [index !== undefined ? `Запис ${index + 1}` : '', field].filter(Boolean).join(' → ')
  return where ? `${where}: ${first.message}` : first.message
}
