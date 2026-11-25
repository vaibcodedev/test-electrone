import type { BidType, PlatformKind, ProposalStatus } from '@shared/domain/freelance'
import { daysSince, fmtDayFull, plural } from '@/lib/format'
import type { badgeVariants } from '@/components/ui/badge'
import type { VariantProps } from 'class-variance-authority'

/** One map for main (search, pins, trash) and the page. */
export { PROPOSAL_STATUS_LABEL } from '@shared/domain/freelance'

/** Pipeline columns shown on the kanban, in order. */
export const ACTIVE_STATUSES: ProposalStatus[] = [
  'draft',
  'sent',
  'viewed',
  'replied',
  'interview',
  'offer',
  'hired'
]
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
  hired: 'success',
  declined: 'destructive',
  no_reply: 'outline',
  withdrawn: 'outline',
  closed: 'outline'
}

export const BID_TYPE_LABEL: Record<BidType, string> = {
  fixed: 'Фіксована',
  hourly: 'Погодинно'
}

export const PLATFORM_KIND_LABEL: Record<PlatformKind, string> = {
  upwork: 'Upwork',
  freelancehunt: 'Freelancehunt',
  direct: 'Прямі замовлення',
  other: 'Інша'
}

export const PLATFORM_COLORS = [
  '#14a800',
  '#2f7dd1',
  '#f5a524',
  '#e5484d',
  '#8e4ec6',
  '#3fbf9b',
  '#14160f',
  '#9a9f93'
]

/** Spoken names of the swatches: a screen reader used to read «#14a800». */
export const PLATFORM_COLOR_NAME: Record<string, string> = {
  '#14a800': 'Зелений',
  '#2f7dd1': 'Синій',
  '#f5a524': 'Жовтий',
  '#e5484d': 'Червоний',
  '#8e4ec6': 'Фіолетовий',
  '#3fbf9b': 'Бірюзовий',
  '#14160f': 'Чорний',
  '#9a9f93': 'Сірий'
}

/** When a proposal went out: «сьогодні», «3 дні тому» within a week, then the date (with the year if not this one). */
export function sentLabel(ts: number, now: number): string {
  const d = daysSince(ts, now) ?? 0
  if (d === 0) return 'сьогодні'
  if (d < 7) return `${d} ${plural(d, ['день', 'дні', 'днів'])} тому`
  return fmtDayFull(ts)
}
