import type { BidType, PlatformKind, ProposalStatus } from '@shared/domain/freelance'
import type { badgeVariants } from '@/components/ui/badge'
import type { VariantProps } from 'class-variance-authority'

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  viewed: 'Просмотрен',
  replied: 'Ответили',
  interview: 'Интервью',
  offer: 'Оффер',
  hired: 'Контракт',
  declined: 'Отказ',
  no_reply: 'Без ответа',
  withdrawn: 'Отозван',
  closed: 'Вакансия закрыта'
}

/** Pipeline columns shown on the kanban, in order. */
export const ACTIVE_STATUSES: ProposalStatus[] = ['draft', 'sent', 'viewed', 'replied', 'interview', 'offer', 'hired']
/** Terminal "negative" statuses, grouped in the collapsed «Закрытые» lane. */
export const CLOSED_STATUSES: ProposalStatus[] = ['declined', 'no_reply', 'withdrawn', 'closed']

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

export const PROPOSAL_STATUS_BADGE: Record<ProposalStatus, BadgeVariant> = {
  draft: 'outline',
  sent: 'soft',
  viewed: 'soft',
  replied: 'info',
  interview: 'info',
  offer: 'warn',
  hired: 'lime',
  declined: 'destructive',
  no_reply: 'outline',
  withdrawn: 'outline',
  closed: 'outline'
}

export const BID_TYPE_LABEL: Record<BidType, string> = {
  fixed: 'Фикс',
  hourly: 'Почасово'
}

export const PLATFORM_KIND_LABEL: Record<PlatformKind, string> = {
  upwork: 'Upwork',
  freelancehunt: 'Freelancehunt',
  direct: 'Прямые заказы',
  other: 'Другая'
}

export const PLATFORM_COLORS = ['#14a800', '#2f7dd1', '#f5a524', '#e5484d', '#8e4ec6', '#3fbf9b', '#14160f', '#9a9f93']

export const DAY_MS = 86_400_000

export function daysSince(ts: number | null, now: number): number | null {
  if (!ts) return null
  return Math.max(0, Math.floor((now - ts) / DAY_MS))
}
