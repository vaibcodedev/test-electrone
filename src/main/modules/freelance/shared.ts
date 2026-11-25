/** Labels, row types and pipeline ranks shared by the parts of the freelance hub. */
import type { MessageTemplate, Proposal, ProposalStatus, TemplateSituation } from '@shared/domain/freelance'
import { messageTemplates, proposals } from '../../db/schema'
import type { SoftRepository } from '../../core/soft-repository'

export type ProposalRow = typeof proposals.$inferSelect
export type TemplateRow = typeof messageTemplates.$inferSelect
export type ProposalRepo = SoftRepository<ProposalRow, Proposal>
export type TemplateRepo = SoftRepository<TemplateRow, Omit<MessageTemplate, 'usedIn' | 'replied' | 'hired'>>

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Чернетка',
  sent: 'Надіслано',
  viewed: 'Переглянуто',
  replied: 'Відповіли',
  interview: 'Інтерв’ю',
  offer: 'Офер',
  hired: 'Контракт',
  declined: 'Відмова',
  no_reply: 'Без відповіді',
  withdrawn: 'Відкликано',
  closed: 'Вакансію закрито'
}

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

/** Pipeline rank: how far a status got. Terminal "negative" statuses rank by timestamps instead. */
export const RANK: Partial<Record<ProposalStatus, number>> = {
  sent: 1,
  viewed: 2,
  replied: 3,
  interview: 4,
  offer: 5,
  hired: 6
}
export const REPLIED_STATUSES: ProposalStatus[] = ['replied', 'interview', 'offer', 'hired']
