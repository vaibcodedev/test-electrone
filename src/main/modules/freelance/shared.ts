/** Labels, row types and pipeline ranks shared by the parts of the freelance hub. */
import type { MessageTemplate, Proposal, ProposalStatus } from '@shared/domain/freelance'
import { messageTemplates, proposals } from '../../db/schema'
import type { SoftRepository } from '../../core/soft-repository'

export type ProposalRow = typeof proposals.$inferSelect
export type TemplateRow = typeof messageTemplates.$inferSelect
export type ProposalRepo = SoftRepository<ProposalRow, Proposal>
export type TemplateRepo = SoftRepository<
  TemplateRow,
  Omit<MessageTemplate, 'usedIn' | 'replied' | 'hired'>
>

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
