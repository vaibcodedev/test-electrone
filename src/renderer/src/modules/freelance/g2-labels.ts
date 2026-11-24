import type { GoalMetric, GoalPeriod, TemplateSituation } from '@shared/domain/freelance'

export const SITUATION_LABEL: Record<TemplateSituation, string> = {
  proposal: 'Отклик',
  first_message: 'Первое сообщение',
  estimate: 'Оценка сроков',
  tz_questions: 'Вопросы по ТЗ',
  revisions: 'Правки',
  follow_up: 'Напоминание',
  small_talk: 'Small talk',
  closing: 'Завершение',
  cover_letter: 'Сопроводительное',
  recruiter: 'Ответ рекрутеру',
  thank_you: 'Благодарность после интервью',
  other: 'Другое'
}

export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  net_income: 'Чистый доход',
  proposals: 'Отклики',
  replies: 'Ответы',
  contracts: 'Контракты',
  reply_rate: '% ответов',
  hire_rate: '% контрактов'
}

export const GOAL_PERIOD_LABEL: Record<GoalPeriod, string> = {
  week: 'Неделя',
  month: 'Месяц'
}

export const SEVERITY_LABEL: Record<number, string> = {
  1: 'Осторожно',
  2: 'Серьёзно',
  3: 'Обходить'
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
