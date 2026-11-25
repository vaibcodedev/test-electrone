import type { GoalMetric, GoalPeriod } from '@shared/domain/freelance'

/** One map for main (search subtitles) and the page. */
export { SITUATION_LABEL } from '@shared/domain/freelance'

export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  net_income: 'Чистий дохід',
  proposals: 'Відгуки',
  replies: 'Відповіді',
  contracts: 'Контракти',
  reply_rate: 'Частка відповідей',
  hire_rate: 'Частка контрактів'
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
  link: 'Посилання',
  part: 'Частина',
  step: 'Крок'
}

/**
 * «name» → «Ім’я клієнта»; numbered «question_1» → «Питання 1»; unknown «budget_range» → «Budget range»
 * (never a raw lowercase key).
 */
export function variableLabel(v: string): string {
  const key = v.toLowerCase()
  const known = VARIABLE_LABEL[key]
  if (known) return known
  const numbered = key.match(/^(.*?)[_-]?(\d+)$/)
  if (numbered && VARIABLE_LABEL[numbered[1]]) return `${VARIABLE_LABEL[numbered[1]]} ${numbered[2]}`
  const words = v.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** {variable} names in a template body, in order of first appearance. */
export function templateVariables(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(/\{([\p{L}\w-]+)\}/gu)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{([\p{L}\w-]+)\}/gu, (whole, name: string) => values[name]?.trim() || whole)
}
