import type { ReactElement } from 'react'
import {
  CLIENT_STATUSES,
  clientInputSchema,
  type ClientPatch,
  type ClientSummary
} from '@shared/domain/crm'
import { limitsOf } from '@/lib/limits'
import { fmtHours, fmtMoney } from '@/lib/format'
import { EditableScope } from '@/components/common/detail-mode-context'
import { InlineTitle } from '@/components/common/master-detail'
import { Choice } from '@/components/common/choice'
import { EmptyValue } from '@/components/common/empty-value'
import { MoneyValue } from '@/components/common/money-value'
import { StatTile } from '@/components/common/stat-tile'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { CLIENT_STATUS_LABEL } from './labels'
import { AvoidBadge, PlatformBadge } from './platform-fields'

const CLIENT_L = limitsOf(clientInputSchema)

/** Avatar, name, status and badges. Record actions are a row above (client-page); contacts live in the aside. */
export function ClientHeader({
  c,
  name,
  onNameChange,
  patch
}: {
  c: ClientSummary
  name: string
  onNameChange: (name: string) => void
  patch: (p: ClientPatch) => void
}): ReactElement {
  return (
    <div className="flex items-start gap-4">
      <Avatar className="size-14 shrink-0">
        <AvatarFallback className="bg-surface text-stat-sm font-semibold text-foreground">
          {c.name.slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <InlineTitle value={name} onChange={onNameChange} maxLength={CLIENT_L.name} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Status is a quick action (docs/design-system.md §8): it changes in view mode too. */}
          <EditableScope>
            <Choice
              aria-label="Статус клієнта"
              className="w-44"
              value={c.status}
              onChange={(v) => v && patch({ status: v })}
              options={CLIENT_STATUSES.map((s) => ({ value: s, label: CLIENT_STATUS_LABEL[s] }))}
            />
          </EditableScope>
          {/* The select already says «Не працювати»: the badge only points to the stop list. */}
          {c.status === 'avoid' && <AvoidBadge className="h-9 px-3" label="Червоні прапорці" />}
          <PlatformBadge platformId={c.platformId} />
          {c.platformId && c.paymentVerified === false && (
            <Badge variant="warn">Оплату не верифіковано</Badge>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Projects, paid, owed, hours: one bright tile at most — «Очікується» when something is owed, and none
 * while editing («Зберегти» is the only lime then). The whole row uses the smaller stat role: a
 * quarter-width tile cut «600,00 U…» in text-headline, and counts next to sums must not look bigger.
 */
export function ClientStats({ c, editing }: { c: ClientSummary; editing: boolean }): ReactElement {
  const hours =
    c.trackedMinutes > 0 ? (
      <span className="text-stat-sm">{fmtHours(c.trackedMinutes)}</span>
    ) : (
      <EmptyValue>ще не відстежено</EmptyValue>
    )
  return (
    <div className="stagger mt-6 grid grid-cols-4 gap-3">
      <StatTile
        label="Проєкти в роботі"
        value={
          !c.projectCount ? (
            <EmptyValue>ще немає проєктів</EmptyValue>
          ) : c.activeProjectCount ? (
            <span className="text-stat-sm">{c.activeProjectCount}</span>
          ) : (
            <EmptyValue>немає активних</EmptyValue>
          )
        }
        hint={c.projectCount ? `з ${c.projectCount} усього` : undefined}
      />
      <StatTile
        label="Оплачено"
        value={
          c.paidTotal > 0 ? (
            <span className="text-stat-sm">
              <MoneyValue amount={c.paidTotal} currency={c.currency} />
            </span>
          ) : (
            <EmptyValue>ще немає оплат</EmptyValue>
          )
        }
      />
      <StatTile
        label="Очікується"
        tone={c.outstandingTotal > 0 && !editing ? 'lime' : 'surface'}
        value={
          c.outstandingTotal > 0 ? (
            <span className="text-stat-sm">
              <MoneyValue amount={c.outstandingTotal} currency={c.currency} />
            </span>
          ) : (
            <EmptyValue>нічого не чекаємо</EmptyValue>
          )
        }
      />
      {c.defaultBilling === 'hourly' ? (
        <StatTile
          label="Години"
          value={hours}
          hint={c.defaultRate > 0 ? `${fmtMoney(c.defaultRate, c.currency)}/год` : undefined}
        />
      ) : (
        <StatTile label="Відпрацьовано" value={hours} />
      )}
    </div>
  )
}
