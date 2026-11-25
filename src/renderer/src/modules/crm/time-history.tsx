import { useMemo, useState, type ReactElement } from 'react'
import { format } from 'date-fns'
import { Pencil, Trash2 } from 'lucide-react'
import type { TimeEntry } from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { capitalize, LOCALE, fmtMinutes, fmtMoney } from '@/lib/format'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { presenceProps, usePresenceList } from '@/hooks/use-presence-list'
import { EntryForm } from './entry-form'
import { useInlineForm } from './inline-form'
import { draftOf, toRange } from './time-range'

/** "<1 хв" for short entries, otherwise «1 год 5 хв». */
const fmtDuration = (min: number): string => (min < 1 ? '<1 хв' : fmtMinutes(min))

/** Rows shown per day before «ще N». */
const DAY_LIMIT = 8
const entryKey = (e: TimeEntry): string => e.id

/** Shared grid: range · description · money/badge · duration · actions — day totals use the same columns. */
const ROW_GRID = 'grid grid-cols-[96px_minmax(0,1fr)_auto_84px_56px] items-center gap-3 px-3'

function EntryRow({
  entry,
  rate,
  currency,
  showBillable
}: {
  entry: TimeEntry
  rate: number
  currency: string
  showBillable: boolean
}): ReactElement {
  const [editing, setEditing] = useInlineForm('запис часу')
  const update = useApiMutation('time', 'update', { onSuccess: () => setEditing(false) })
  const remove = useApiMutation('time', 'remove')
  if (editing) {
    return (
      <EntryForm
        initial={draftOf(entry)}
        submitLabel="Зберегти"
        showBillable={showBillable}
        pending={update.isPending}
        onCancel={() => setEditing(false)}
        onSubmit={(d) => {
          const r = toRange(d)
          if (r && !update.isPending)
            update.mutate({
              id: entry.id,
              patch: { ...r, description: d.description, billable: d.billable }
            })
        }}
      />
    )
  }
  return (
    <div
      className={cn(
        ROW_GRID,
        'group min-h-10 rounded-xl py-1.5 transition-colors hover:bg-foreground/5'
      )}
    >
      <span className="text-caption text-muted-foreground tabular-nums">
        {format(entry.startedAt, 'HH:mm')}–{entry.endedAt ? format(entry.endedAt, 'HH:mm') : '…'}
      </span>
      <span
        className={cn('truncate text-body', !entry.description && 'text-muted-foreground')}
        title={entry.description || undefined}
      >
        {entry.description || 'без опису'}
      </span>
      <span className="text-right">
        {showBillable && !entry.billable ? (
          <Badge variant="soft">не оплачується</Badge>
        ) : (
          rate > 0 && (
            <span className="text-caption text-muted-foreground tabular-nums">
              {fmtMoney((entry.minutes / 60) * rate, currency)}
            </span>
          )
        )}
      </span>
      <span className="text-right text-body tabular-nums">{fmtDuration(entry.minutes)}</span>
      <span
        data-edit-only
        className="flex justify-end opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <IconAction label="Змінити запис" onClick={() => setEditing(true)}>
          <Pencil />
        </IconAction>
        <Confirm
          title={`Видалити запис ${fmtDuration(entry.minutes)}?`}
          description="Відновити не можна."
          onConfirm={() => remove.mutate(entry.id)}
        >
          <IconAction label="Видалити запис" className="hover:text-destructive">
            <Trash2 />
          </IconAction>
        </Confirm>
      </span>
    </div>
  )
}

/** «Середа, 25 листопада» (+ year when it isn't this year) for a day key «2026-11-25». */
function dayTitle(day: string): string {
  const d = new Date(`${day}T00:00`)
  const pattern =
    d.getFullYear() === new Date().getFullYear() ? 'EEEE, d MMMM' : 'EEEE, d MMMM yyyy'
  return capitalize(format(d, pattern, { locale: LOCALE }))
}

/** One day of the history: title + total, the first DAY_LIMIT rows and «ще N». */
export function DayGroup({
  day,
  entries,
  rate,
  currency,
  showBillable
}: {
  day: string
  entries: TimeEntry[]
  rate: number
  currency: string
  showBillable: boolean
}): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const total = entries.reduce((sum, e) => sum + e.minutes, 0)
  // Memoised (usePresenceList compares the array): «ще N» unfolds the rest of the day, «Згорнути» folds it.
  const shown = useMemo(
    () => (expanded ? entries : entries.slice(0, DAY_LIMIT)),
    [expanded, entries]
  )
  const rows = usePresenceList(shown, entryKey)
  return (
    <div className="flex flex-col gap-0.5">
      <div className={cn(ROW_GRID, 'pb-1 text-caption')}>
        <span className="col-span-3 font-medium text-muted-foreground">{dayTitle(day)}</span>
        <span className="text-right font-semibold tabular-nums">{fmtDuration(total)}</span>
        <span />
      </div>
      {rows.map((row) => (
        <div key={row.key} {...presenceProps(row)}>
          <EntryRow entry={row.item} rate={rate} currency={currency} showBillable={showBillable} />
        </div>
      ))}
      {entries.length > DAY_LIMIT && (
        <Button
          variant="ghost"
          size="xs"
          className="ml-1 w-fit text-muted-foreground"
          onClick={() => setExpanded((x) => !x)}
        >
          {expanded ? 'Згорнути' : `ще ${entries.length - DAY_LIMIT}`}
        </Button>
      )}
    </div>
  )
}
