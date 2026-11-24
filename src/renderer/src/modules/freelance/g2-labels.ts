import type { GoalMetric, GoalPeriod, TemplateSituation } from '@shared/domain/freelance'

export const SITUATION_LABEL: Record<TemplateSituation, string> = {
  proposal: 'Відгук',
  first_message: 'Перше повідомлення',
  estimate: 'Оцінка термінів',
  tz_questions: 'Питання щодо ТЗ',
  revisions: 'Правки',
  follow_up: 'Нагадування',
  small_talk: 'Small talk',
  closing: 'Завершення',
  cover_letter: 'Супровідний лист',
  recruiter: 'Відповідь рекрутеру',
  thank_you: 'Подяка після інтерв’ю',
  other: 'Інше'
}

export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  net_income: 'Чистий дохід',
  proposals: 'Відгуки',
  replies: 'Відповіді',
  contracts: 'Контракти',
  reply_rate: '% відповідей',
  hire_rate: '% контрактів'
}

export const GOAL_PERIOD_LABEL: Record<GoalPeriod, string> = {
  week: 'Тиждень',
  month: 'Місяць'
}

export const SEVERITY_LABEL: Record<number, string> = {
  1: 'Обережно',
  2: 'Серйозно',
  3: 'Критично'
}

/** {variable} names in a template body, in order of first appearance. */
/** Human labels for template variables; the {token} itself stays visible as a hint next to the label. */
const VARIABLE_LABEL: Record<string, string> = {
  name: 'Ім’я клієнта',
  client: 'Клієнт',
  my_name: 'Моє ім’я',
  task: 'Завдання',
  timeline: 'Терміни',
  deadline: 'Дедлайн',
  start_date: 'Дата початку',
  total: 'Сума',
  price: 'Ціна',
  hours: 'Години',
  summary: 'Що зроблено',
  similar_project: 'Схожий проєкт',
  question: 'Питання',
  answer: 'Відповідь',
  platform: 'Платформа',
  my_availability: 'Коли я вільний',
  main_goal: 'Головна мета',
  included: 'Що входить',
  company: 'Компанія',
  position: 'Посада',
  link: 'Посилання'
}

/** «name» → «Ім’я клієнта»; unknown «budget_range» → «Budget range» (never a raw lowercase key). */
export function variableLabel(v: string): string {
  const known = VARIABLE_LABEL[v.toLowerCase()]
  if (known) return known
  const words = v.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function templateVariables(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(/\{([\p{L}\w-]+)\}/gu)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{([\p{L}\w-]+)\}/gu, (whole, name: string) => values[name]?.trim() || whole)
}

export const pct = (n: number): string => `${Math.round(n)}%`
