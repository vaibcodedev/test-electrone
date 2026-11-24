import { useEffect, useMemo, useState } from 'react'
import { format, isToday } from 'date-fns'
import { Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import type { TimeEntry } from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { LOCALE, fmtMinutes, fmtMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Field as UiField, FieldLabel } from '@/components/ui/field'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { cn } from '@/lib/utils'
import { Section } from './parts'

const dayKey = (ts: number): string => format(ts, 'yyyy-MM-dd')
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const startOfDayMs = (ts: number): number => new Date(ts).setHours(0, 0, 0, 0)

function combine(day: number, time: string): number | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h)) return null
  const d = new Date(day)
  d.setHours(h, m || 0, 0, 0)
  return d.getTime()
}

interface EntryDraft {
  day: number
  from: string
  to: string
  minutes: string
  description: string
  billable: boolean
}

function emptyDraft(): EntryDraft {
  return {
    day: startOfDayMs(Date.now()),
    from: '',
    to: '',
    minutes: '',
    description: '',
    billable: true
  }
}

function draftOf(e: TimeEntry): EntryDraft {
  return {
    day: startOfDayMs(e.startedAt),
    from: format(e.startedAt, 'HH:mm'),
    to: e.endedAt ? format(e.endedAt, 'HH:mm') : '',
    minutes: '',
    description: e.description,
    billable: e.billable
  }
}

/** Converts a draft to start/end: either explicit from–to, or "minutes" ending now (or at 18:00 of a past day). */
function toRange(d: EntryDraft): { startedAt: number; endedAt: number } | null {
  const from = combine(d.day, d.from)
  const to = combine(d.day, d.to)
  if (from !== null && to !== null) return to > from ? { startedAt: from, endedAt: to } : null
  const minutes = Number(d.minutes.replace(',', '.'))
  if (!minutes || minutes <= 0) return null
  const end =
    from !== null ? from + minutes * 60_000 : isToday(d.day) ? Date.now() : combine(d.day, '18:00')!
  return { startedAt: from ?? end - minutes * 60_000, endedAt: end }
}

function EntryForm({
  initial,
  submitLabel,
  showBillable,
  onSubmit,
  onCancel
}: {
  initial: EntryDraft
  submitLabel: string
  showBillable: boolean
  onSubmit: (d: EntryDraft) => void
  onCancel?: () => void
}) {
  const [d, setD] = useState(initial)
  const set = (patch: Partial<EntryDraft>): void => setD((x) => ({ ...x, ...patch }))
  const range = toRange(d)
  return (
    <Card className="p-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (range) onSubmit(d)
        }}
      >
        <Field label="Дата" className="w-44">
          <DatePicker
            value={d.day}
            clearable={false}
            onChange={(v) => v && set({ day: startOfDayMs(v) })}
          />
        </Field>
        <Field label="С" className="w-24">
          <Input
            type="time"
            className="bg-card"
            value={d.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </Field>
        <Field label="До" className="w-24">
          <Input
            type="time"
            className="bg-card"
            value={d.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </Field>
        <Field label="или минут" className="w-24">
          <Input
            inputMode="numeric"
            className="bg-card"
            value={d.minutes}
            disabled={!!d.to}
            onChange={(e) => set({ minutes: e.target.value })}
            placeholder="90"
          />
        </Field>
        <Field label="Что делал" className="min-w-48 flex-1">
          <Input
            className="bg-card"
            value={d.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Вёрстка корзины"
          />
        </Field>
        {showBillable && (
          <UiField orientation="horizontal" className="h-9 w-auto gap-2">
            <Switch
              id="entry-billable"
              checked={d.billable}
              onCheckedChange={(billable) => set({ billable })}
            />
            <FieldLabel htmlFor="entry-billable" className="text-foreground">
              Оплачиваемо
            </FieldLabel>
          </UiField>
        )}
        <div className="flex gap-1">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
          )}
          <Button type="submit" variant="lime" disabled={!range}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function useElapsed(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startedAt])
  return startedAt ? Math.max(0, now - startedAt) : 0
}

function Clock({ ms }: { ms: number }) {
  const s = Math.floor(ms / 1000)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return (
    <span className="font-display text-stat leading-none tabular-nums">
      {hh}:{mm}
      <span className="opacity-50">:{ss}</span>
    </span>
  )
}

function TimerBar({ projectId }: { projectId: string }) {
  const { data: running } = useApi('time', 'running')
  const [description, setDescription] = useState('')
  const start = useApiMutation('time', 'start', { onSuccess: () => setDescription('') })
  const stop = useApiMutation('time', 'stop', { successMessage: 'Время записано' })
  const mine = running && running.projectId === projectId
  const elapsed = useElapsed(mine ? running.startedAt : undefined)

  if (mine) {
    return (
      <Card className="flex-row items-center gap-4 bg-lime px-5 py-4 text-lime-foreground">
        <Clock ms={elapsed} />
        <span className="min-w-0 flex-1 truncate text-body opacity-75">
          {running.description || 'Таймер идёт'}
        </span>
        <Button
          onClick={() => stop.mutate(undefined)}
          className="bg-lime-foreground text-lime hover:bg-lime-foreground/90"
        >
          <Pause /> Остановить
        </Button>
      </Card>
    )
  }
  return (
    <Card className="bg-ink py-3 pr-4 pl-3 text-ink-foreground">
      <form
        className="flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          start.mutate({ projectId, description: description.trim() || undefined })
        }}
      >
        <Button
          type="submit"
          variant="lime"
          size="icon-lg"
          aria-label="Запустить таймер"
          className="shrink-0"
        >
          <Play className="fill-current" />
        </Button>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Над чем работаете? Enter — запустить таймер"
          className="h-11 flex-1 border-0 bg-transparent text-lead text-ink-foreground shadow-none placeholder:text-ink-muted focus-visible:bg-transparent focus-visible:ring-0"
        />
        {running && (
          <span className="shrink-0 text-caption text-ink-muted">
            Сейчас идёт: {running.projectTitle} — будет остановлен
          </span>
        )}
      </form>
    </Card>
  )
}

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
}) {
  const [editing, setEditing] = useState(false)
  const update = useApiMutation('time', 'update', { onSuccess: () => setEditing(false) })
  const remove = useApiMutation('time', 'remove')
  if (editing) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={5} className="px-0">
          <EntryForm
            initial={draftOf(entry)}
            submitLabel="Сохранить"
            showBillable={showBillable}
            onCancel={() => setEditing(false)}
            onSubmit={(d) => {
              const r = toRange(d)
              if (r)
                update.mutate({
                  id: entry.id,
                  patch: { ...r, description: d.description, billable: d.billable }
                })
            }}
          />
        </TableCell>
      </TableRow>
    )
  }
  return (
    <TableRow className="group">
      <TableCell className="w-28 text-caption text-muted-foreground tabular-nums">
        {format(entry.startedAt, 'HH:mm')}–{entry.endedAt ? format(entry.endedAt, 'HH:mm') : '…'}
      </TableCell>
      <TableCell className={cn('max-w-0 truncate', !entry.description && 'text-muted-foreground')}>
        {entry.description || 'Без описания'}
      </TableCell>
      <TableCell className="w-36 text-right">
        {showBillable && !entry.billable ? (
          <Badge variant="soft">не оплачивается</Badge>
        ) : (
          rate > 0 && (
            <span className="text-caption text-muted-foreground tabular-nums">
              {fmtMoney((entry.minutes / 60) * rate, currency)}
            </span>
          )
        )}
      </TableCell>
      <TableCell className="w-20 text-right tabular-nums">{fmtMinutes(entry.minutes)}</TableCell>
      <TableCell className="w-16">
        <div className="flex opacity-0 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Изменить"
            onClick={() => setEditing(true)}
            disabled={!entry.endedAt}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Удалить"
            className="hover:text-destructive"
            onClick={() => remove.mutate(entry.id)}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * Time tracking for a project: live timer, manual entry, history grouped by day.
 * For hourly projects it drives the money; for others it is a secondary "how long it really took" log.
 */
export function TimeSection({
  projectId,
  entries,
  rate,
  currency,
  hourly,
  secondary
}: {
  projectId: string
  entries: TimeEntry[]
  rate: number
  currency: string
  hourly: boolean
  secondary?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const create = useApiMutation('time', 'create', {
    successMessage: 'Время добавлено',
    onSuccess: () => setAdding(false)
  })

  const days = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const e of entries)
      map.set(dayKey(e.startedAt), [...(map.get(dayKey(e.startedAt)) ?? []), e])
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [entries])

  return (
    <Section
      title={secondary ? 'Учёт времени' : 'Время'}
      hint={
        secondary
          ? 'Для себя: сколько на самом деле уходит на проект. На оплату не влияет.'
          : undefined
      }
      action={
        !adding && (
          <Button variant="soft" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Вручную
          </Button>
        )
      }
    >
      <TimerBar projectId={projectId} />
      {adding && (
        <EntryForm
          initial={emptyDraft()}
          submitLabel="Добавить"
          showBillable={hourly}
          onCancel={() => setAdding(false)}
          onSubmit={(d) => {
            const r = toRange(d)
            if (r)
              create.mutate({ projectId, ...r, description: d.description, billable: d.billable })
          }}
        />
      )}
      {days.length === 0 && !adding && (
        <p className="text-body text-muted-foreground">
          {hourly
            ? 'Запустите таймер или добавьте время вручную — часы попадут в расчёт оплаты.'
            : 'Запустите таймер, чтобы видеть фактическую ставку проекта.'}
        </p>
      )}
      <div className="flex flex-col gap-4">
        {days.slice(0, 30).map(([day, list]) => {
          const total = list.reduce((s, e) => s + e.minutes, 0)
          return (
            <div key={day}>
              <div className="mb-1 flex items-center justify-between px-2 text-caption text-muted-foreground">
                <span>
                  {capitalize(format(new Date(`${day}T00:00`), 'EEEE, d MMMM', { locale: LOCALE }))}
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {fmtMinutes(total)}
                </span>
              </div>
              <Table>
                <TableBody>
                  {list.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      rate={hourly ? rate : 0}
                      currency={currency}
                      showBillable={hourly}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
