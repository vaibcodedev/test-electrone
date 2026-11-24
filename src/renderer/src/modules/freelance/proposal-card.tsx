import { forwardRef, type ComponentProps } from 'react'
import { BadgeCheck, Coins, Star } from 'lucide-react'
import type { Proposal } from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { fmtMoney, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { daysSince } from './proposal-labels'

/** Compact proposal tile used on the kanban (composed of shadcn Card + Badge). */
export const ProposalCard = forwardRef<
  HTMLDivElement,
  ComponentProps<'div'> & { proposal: Proposal; currency: Currency; now: number; dragging?: boolean; creditsName?: string }
>(function ProposalCard({ proposal: p, currency, now, dragging, creditsName, className, ...rest }, ref) {
  const days = daysSince(p.sentAt, now)
  const credits = p.credits + p.boostCredits
  return (
    <Card
      ref={ref}
      role="button"
      tabIndex={0}
      className={cn(
        'cursor-pointer gap-2 rounded-2xl bg-card px-3.5 py-3 ring-1 ring-border transition-shadow outline-none hover:ring-foreground/20 focus-visible:ring-2 focus-visible:ring-ring',
        dragging && 'opacity-40',
        className
      )}
      {...rest}
    >
      <div className="flex items-start gap-2">
        <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug font-medium">{p.jobTitle}</span>
        {p.starred && <Star className="mt-0.5 size-3.5 shrink-0 fill-warn text-warn" aria-label="Сильный отклик" />}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {p.niche && <Badge variant="soft">{p.niche}</Badge>}
        {p.bidAmount > 0 && (
          <Badge variant="outline">
            {fmtMoney(p.bidAmount, currency)}
            {p.bidType === 'hourly' ? '/ч' : ''}
          </Badge>
        )}
        {credits > 0 && (
          <Badge variant="outline" title={creditsName}>
            <Coins />
            {p.credits}
            {p.boostCredits > 0 && `+${p.boostCredits}`}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        {days !== null ? (
          <span>{days === 0 ? 'сегодня' : `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`}</span>
        ) : (
          <span>не отправлен</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {p.clientRating !== null && (
            <span className="flex items-center gap-0.5" title="Рейтинг клиента">
              <Star className="size-3" />
              {p.clientRating.toFixed(1)}
            </span>
          )}
          {p.paymentVerified && <BadgeCheck className="size-3.5 text-success" aria-label="Оплата верифицирована" />}
        </span>
      </div>
    </Card>
  )
})
