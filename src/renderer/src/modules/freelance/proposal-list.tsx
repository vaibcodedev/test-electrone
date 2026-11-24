import { useState } from 'react'
import { BadgeCheck, Star } from 'lucide-react'
import type { Proposal } from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { fmtDate, fmtMoney } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { daysSince, PROPOSAL_STATUS_BADGE, PROPOSAL_STATUS_LABEL } from './proposal-labels'

/** Proposals as a table (shadcn Table); rows open the editor. */
export function ProposalList({
  proposals,
  currency,
  activeId,
  onOpen
}: {
  proposals: Proposal[]
  currency: Currency
  activeId: string | null
  onOpen: (id: string) => void
}) {
  const [now] = useState(() => Date.now())
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Вакансия</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead className="text-right">Ставка</TableHead>
            <TableHead className="text-right">Коннекты</TableHead>
            <TableHead>Клиент</TableHead>
            <TableHead className="pr-4 text-right">Отправлен</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proposals.map((p) => {
            const days = daysSince(p.sentAt, now)
            return (
              <TableRow
                key={p.id}
                tabIndex={0}
                aria-selected={activeId === p.id}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)}
                className={cn('cursor-pointer', activeId === p.id && 'bg-surface')}
              >
                <TableCell className="max-w-[320px] pl-4">
                  <div className="flex items-center gap-1.5">
                    {p.starred && <Star className="size-3.5 shrink-0 fill-warn text-warn" />}
                    <span className="truncate font-medium">{p.jobTitle}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={PROPOSAL_STATUS_BADGE[p.status]}>{PROPOSAL_STATUS_LABEL[p.status]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.niche || '—'}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.bidAmount ? `${fmtMoney(p.bidAmount, currency)}${p.bidType === 'hourly' ? '/ч' : ''}` : '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.credits}
                  {p.boostCredits > 0 && <span className="text-muted-foreground">+{p.boostCredits}</span>}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{p.clientName || '—'}</span>
                    {p.paymentVerified && <BadgeCheck className="size-3.5 shrink-0 text-success" aria-label="Оплата верифицирована" />}
                  </span>
                </TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">
                  {p.sentAt ? (days !== null && days < 7 ? `${days} дн. назад` : fmtDate(p.sentAt, 'd MMM')) : '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
