import type { ReactElement } from 'react'
import {
  CLIENT_STATUSES,
  clientInputSchema,
  type ClientPatch,
  type ClientSummary
} from '@shared/domain/crm'
import { limitsOf } from '@/lib/limits'
import { fmtHours, fmtMoney } from '@/lib/format'
import type { DetailMode } from '@/components/common/detail-mode-context'
import { EditToggle } from '@/components/common/detail-mode'
import { InlineTitle } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { MoneyValue } from '@/components/common/money-value'
import { StatTile } from '@/components/common/stat-tile'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { CLIENT_STATUS_LABEL } from './labels'
import { Choice, EmptyValue, TrashButton } from './parts'
import { AvoidBadge, PlatformBadge } from './platform-fields'

const CLIENT_L = limitsOf(clientInputSchema)

/** Avatar, name, status and badges; record actions on the right. Contacts live in the aside. */
export function ClientHeader({
  c,
  name,
  onNameChange,
  mode,
  patch,
  onRemove
}: {
  c: ClientSummary
  name: string
  onNameChange: (name: string) => void
  mode: DetailMode
  patch: (p: ClientPatch) => void
  onRemove: () => void
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
          {/* In view mode the select is plain text: no fixed width, no gap before the badges. */}
          <Choice
            className={mode.editing ? 'w-44' : 'w-fit'}
            value={c.status}
            onChange={(v) => v && patch({ status: v })}
            options={CLIENT_STATUSES.map((s) => ({ value: s, label: CLIENT_STATUS_LABEL[s] }))}
          />
          {c.status === 'avoid' && <AvoidBadge className="h-9 px-3" />}
          <PlatformBadge platformId={c.platformId} />
          {c.platformId && c.paymentVerified === false && (
            <Badge variant="warn">Оплату не верифіковано</Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-2">
        <EditToggle mode={mode} />
        <PinButtons entity={{ type: 'client', id: c.id }} />
        <TrashButton
          title="Видалити клієнта?"
          description="Клієнт піде в кошик на 30 днів. Проєкти залишаться без клієнта."
          onConfirm={onRemove}
        />
      </div>
    </div>
  )
}

/** Projects, paid, owed, hours: one bright tile at most — «Очікується» when something is owed. */
export function ClientStats({ c }: { c: ClientSummary }): ReactElement {
  const hours =
    c.trackedMinutes > 0 ? fmtHours(c.trackedMinutes) : <EmptyValue>ще не відстежено</EmptyValue>
  return (
    <div className="stagger mt-6 grid grid-cols-4 gap-3">
      <StatTile
        label="Проєкти в роботі"
        value={c.projectCount ? c.activeProjectCount : <EmptyValue>ще немає</EmptyValue>}
        hint={c.projectCount ? `з ${c.projectCount} усього` : undefined}
      />
      <StatTile
        label="Оплачено"
        value={
          c.paidTotal > 0 ? (
            <MoneyValue amount={c.paidTotal} currency={c.currency} />
          ) : (
            <EmptyValue>ще немає оплат</EmptyValue>
          )
        }
      />
      <StatTile
        label="Очікується"
        tone={c.outstandingTotal > 0 ? 'lime' : 'surface'}
        value={
          c.outstandingTotal > 0 ? (
            <MoneyValue amount={c.outstandingTotal} currency={c.currency} />
          ) : (
            <EmptyValue>нічого не чекаємо</EmptyValue>
          )
        }
      />
      {c.defaultBilling === 'hourly' ? (
        <StatTile
          label="Години"
          value={hours}
          hint={c.defaultRate > 0 ? `${fmtMoney(c.defaultRate, c.currency)} / год` : undefined}
        />
      ) : (
        <StatTile label="Відпрацьовано" value={hours} />
      )}
    </div>
  )
}
