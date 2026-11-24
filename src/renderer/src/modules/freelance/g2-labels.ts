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
export function templateVariables(body: string): string[] {
  const out: string[] = []
  for (const m of body.matchAll(/\{([\p{L}\w-]+)\}/gu)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{([\p{L}\w-]+)\}/gu, (whole, name: string) => values[name]?.trim() || whole)
}

export const pct = (n: number): string => `${Math.round(n)}%`
