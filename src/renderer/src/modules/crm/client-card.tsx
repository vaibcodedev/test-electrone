import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import type { ClientSummary } from '@shared/domain/crm'
import { fmtHours, fmtMoney, fmtMoneyCompact, plural } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { CLIENT_STATUS_BADGE, CLIENT_STATUS_LABEL } from './labels'
import { AvoidBadge, PlatformBadge } from './platform-fields'

/** «1 проєкт у роботі з 3», «2 проєкти», «Ще без проєктів». */
function projectsLine(c: ClientSummary): string {
  if (!c.projectCount) return 'Ще без проєктів'
  const all = `${c.projectCount} ${plural(c.projectCount, ['проєкт', 'проєкти', 'проєктів'])}`
  if (!c.activeProjectCount) return all
  if (c.activeProjectCount === c.projectCount) return `${all} у роботі`
  return `${c.activeProjectCount} у роботі з ${c.projectCount}`
}

/** Client tile on /clients: who (name, company · country), where from and status, then projects and money. */
export function ClientCard({ client }: { client: ClientSummary }): ReactElement {
  const navigate = useNavigate()
  const about = [client.company, client.country].filter(Boolean).join(' · ')
  const status = CLIENT_STATUS_BADGE[client.status]
  const badges = !!client.platformId || client.status === 'avoid' || !!status
  return (
    <Item
      asChild
      variant="muted"
      className="tile group h-full min-h-[168px] w-full min-w-0 flex-col items-stretch justify-between rounded-3xl p-5"
    >
      <button
        type="button"
        onClick={() => navigate(`/clients/${client.id}`)}
        className="w-full min-w-0 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <Avatar className="size-10">
            <AvatarFallback className="bg-card text-lead font-semibold">
              {client.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <ArrowUpRight
            aria-hidden
            className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </div>
        <ItemContent className="w-full min-w-0 gap-1">
          <ItemTitle className="w-full text-lead">
            <span className="truncate" title={client.name}>
              {client.name}
            </span>
          </ItemTitle>
          {about && (
            <ItemDescription className="line-clamp-1 text-caption" title={about}>
              {about}
            </ItemDescription>
          )}
          {badges && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <PlatformBadge platformId={client.platformId} />
              {client.status === 'avoid' && <AvoidBadge link={false} />}
              {status && <Badge variant={status}>{CLIENT_STATUS_LABEL[client.status]}</Badge>}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
            <span>{projectsLine(client)}</span>
            {client.paidTotal > 0 && (
              <span>
                оплачено{' '}
                <span
                  className="text-foreground tabular-nums"
                  title={fmtMoney(client.paidTotal, client.currency)}
                >
                  {fmtMoneyCompact(client.paidTotal, client.currency)}
                </span>
              </span>
            )}
            {/* Waiting for money is the usual state: warn is kept for real problems. */}
            {client.outstandingTotal > 0 && (
              <span>
                чекаємо{' '}
                <span
                  className="text-foreground tabular-nums"
                  title={fmtMoney(client.outstandingTotal, client.currency)}
                >
                  {fmtMoneyCompact(client.outstandingTotal, client.currency)}
                </span>
              </span>
            )}
            {client.defaultBilling === 'hourly' && client.trackedMinutes > 0 && (
              <span>{fmtHours(client.trackedMinutes)}</span>
            )}
          </div>
        </ItemContent>
      </button>
    </Item>
  )
}
