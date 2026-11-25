import { forwardRef, type ComponentProps } from 'react'
import { Award, BadgeCheck, Coins, Star } from 'lucide-react'
import type { Proposal } from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { fmtMoney, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { sentLabel } from './proposal-labels'

/** Compact proposal tile used on the kanban (composed of shadcn Card + Badge). */
export const ProposalCard = forwardRef<
  HTMLDivElement,
  ComponentProps<'div'> & {
    proposal: Proposal
    currency: Currency
    now: number
    dragging?: boolean
    creditsName?: string
  }
>(function ProposalCard(
  { proposal: p, currency, now, dragging, creditsName, className, ...rest },
  ref
) {
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
        <span className="line-clamp-2 min-w-0 flex-1 text-body leading-snug font-medium">
          {p.jobTitle}
        </span>
        {p.starred && (
          <Award className="mt-0.5 size-3.5 shrink-0 text-warn" aria-label="Сильний відгук" />
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {p.niche && (
          <Badge variant="soft" title={p.niche}>
            <span className="truncate">{p.niche}</span>
          </Badge>
        )}
        {p.bidAmount > 0 && (
          <Badge variant="outline">
            {fmtMoney(p.bidAmount, currency)}
            {p.bidType === 'hourly' ? '/год' : ''}
          </Badge>
        )}
        {credits > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline">
                <Coins />
                {p.credits}
                {p.boostCredits > 0 && `+${p.boostCredits}`}
              </Badge>
            </TooltipTrigger>
            {creditsName && <TooltipContent>{creditsName}</TooltipContent>}
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-2 text-meta text-muted-foreground">
        <span>{p.sentAt ? sentLabel(p.sentAt, now) : 'не надіслано'}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {/* A title, not a Tooltip: the card is a button, a nested span can't take focus. */}
          {p.clientRating !== null && (
            <span
              className="flex items-center gap-0.5"
              title="Рейтинг клієнта"
              aria-label={`Рейтинг клієнта ${fmtNumber(p.clientRating)}`}
            >
              <Star className="size-3" aria-hidden />
              {fmtNumber(p.clientRating)}
            </span>
          )}
          {p.paymentVerified && (
            <BadgeCheck className="size-3.5 text-success" aria-label="Оплату верифіковано" />
          )}
        </span>
      </div>
    </Card>
  )
})
