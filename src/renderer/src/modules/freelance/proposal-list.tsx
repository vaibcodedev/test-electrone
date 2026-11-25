import { useState } from 'react'
import { Award, BadgeCheck } from 'lucide-react'
import type { Proposal } from '@shared/domain/freelance'
import type { Currency } from '@shared/domain/crm'
import { fmtMoney } from '@/lib/format'
import { VirtualList } from '@/components/common/virtual-list'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { PROPOSAL_STATUS_BADGE, PROPOSAL_STATUS_LABEL, sentLabel } from './proposal-labels'
import { FavoriteMark } from '@/components/common/favorite-mark'

/** Fixed column widths: every virtual row is its own table, so columns must line up without auto layout. */
const COL = {
  status: 'w-32',
  niche: 'w-[15%]',
  bid: 'w-28',
  credits: 'w-24',
  client: 'w-[18%]',
  // Room for «30 листопада 2025»: older proposals carry the year.
  sent: 'w-40'
} as const

/**
 * Proposals as a table (shadcn Table), virtualized: a header table plus one fixed-layout table
 * per visible row. Rows open the editor; Enter works from the keyboard.
 */
export function ProposalList({
  proposals,
  currency,
  creditsName,
  activeId,
  onOpen,
  loading,
  hasMore,
  loadingMore,
  onLoadMore
}: {
  proposals: Proposal[]
  currency: Currency
  /** Paid-proposal currency of the platform («Connects»); no column when the platform has none. */
  creditsName: string
  activeId: string | null
  onOpen: (id: string) => void
  loading?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}) {
  const [now] = useState(() => Date.now())
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl ring-1 ring-border">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Вакансія</TableHead>
            <TableHead className={COL.status}>Статус</TableHead>
            <TableHead className={COL.niche}>Тип</TableHead>
            <TableHead className={cn(COL.bid, 'text-right')}>Ставка</TableHead>
            {creditsName && (
              <TableHead className={cn(COL.credits, 'truncate text-right')}>
                {creditsName}
              </TableHead>
            )}
            <TableHead className={COL.client}>Клієнт</TableHead>
            <TableHead className={cn(COL.sent, 'pr-4 text-right')}>Надіслано</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
      <VirtualList
        items={proposals}
        loading={loading}
        getKey={(p) => p.id}
        estimateSize={45}
        gap={0}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        renderItem={(p) => (
          <Table className="table-fixed">
            <TableBody>
              <TableRow
                tabIndex={0}
                aria-selected={activeId === p.id}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(p.id)}
                className={cn('cursor-pointer border-b!', activeId === p.id && 'bg-surface')}
              >
                <TableCell className="pl-4">
                  <div className="flex items-center gap-1.5">
                    {p.starred && (
                      <Award className="size-3.5 shrink-0 text-warn" aria-label="Сильний відгук" />
                    )}
                    <span className="truncate font-medium">{p.jobTitle}</span>
                    <FavoriteMark entity={{ type: 'proposal', id: p.id }} />
                  </div>
                </TableCell>
                <TableCell className={COL.status}>
                  <Badge variant={PROPOSAL_STATUS_BADGE[p.status]}>
                    {PROPOSAL_STATUS_LABEL[p.status]}
                  </Badge>
                </TableCell>
                <TableCell className={cn(COL.niche, 'truncate text-muted-foreground')}>
                  {p.niche || '—'}
                </TableCell>
                <TableCell className={cn(COL.bid, 'truncate text-right tabular-nums')}>
                  {p.bidAmount
                    ? `${fmtMoney(p.bidAmount, currency)}${p.bidType === 'hourly' ? '/год' : ''}`
                    : '—'}
                </TableCell>
                {creditsName && (
                  <TableCell className={cn(COL.credits, 'text-right tabular-nums')}>
                    {p.credits}
                    {p.boostCredits > 0 && (
                      <span className="text-muted-foreground">+{p.boostCredits}</span>
                    )}
                  </TableCell>
                )}
                <TableCell className={COL.client}>
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{p.clientName || '—'}</span>
                    {p.paymentVerified && (
                      <BadgeCheck
                        className="size-3.5 shrink-0 text-success"
                        aria-label="Оплату верифіковано"
                      />
                    )}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(COL.sent, 'pr-4 text-right text-muted-foreground tabular-nums')}
                >
                  {p.sentAt ? sentLabel(p.sentAt, now) : '—'}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      />
    </div>
  )
}
