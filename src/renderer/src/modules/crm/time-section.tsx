import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import type { TimeEntry } from '@shared/domain/crm'
import { useApi, useApiMutation } from '@/lib/query'
import { LOCALE, fmtMinutes, fmtMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Field } from '@/components/common/page'
import { cn } from '@/lib/utils'
import { Section } from './parts'

const dayKey = (ts: number): string => format(ts, 'yyyy-MM-dd')
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function combine(date: string, time: string): number | null {
  if (!date || !time) return null
  const t = new Date(`${date}T${time}`).getTime()
  return Number.isNaN(t) ? null : t
}

interface EntryDraft {
  date: string
  from: string
  to: string
  minutes: string
  description: string
  billable: boolean
}

function emptyDraft(): EntryDraft {
  return { date: format(Date.now(), 'yyyy-MM-dd'), from: '', to: '', minutes: '', description: '', billable: true }
}

function draftOf(e: TimeEntry): EntryDraft {
  return {
    date: format(e.startedAt, 'yyyy-MM-dd'),
    from: format(e.startedAt, 'HH:mm'),
    to: e.endedAt ? format(e.endedAt, 'HH:mm') : '',
    minutes: '',
    description: e.description,
    billable: e.billable
  }
}

/** Converts a draft to start/end: either explicit from–to, or "minutes" ending now (or at 18:00 of a past day). */
function toRange(d: EntryDraft): { startedAt: number; endedAt: number } | null {
  const from = combine(d.date, d.from)
  const to = combine(d.date, d.to)
  if (from !== null && to !== null) return to > from ? { startedAt: from, endedAt: to } : null
  const minutes = Number(d.minutes.replace(',', '.'))
  if (!minutes || minutes <= 0) return null
  const isToday = d.date === format(Date.now(), 'yyyy-MM-dd')
  const end = from !== null ? from + minutes * 60_000 : isToday ? Date.now() : combine(d.date, '18:00')!
  return { startedAt: from ?? end - minutes * 60_000, endedAt: end }
}

function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel
}: {
  initial: EntryDraft
  submitLabel: string
  onSubmit: (d: EntryDraft) => void
  onCancel?: () => void
}) {
  const [d, setD] = useState(initial)
  const set = (patch: Partial<EntryDraft>): void => setD((x) => ({ ...x, ...patch }))
  const range = toRange(d)
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (range) onSubmit(d)
      }}
    >
      <Field label="Дата">
        <Input type="date" className="w-36 bg-card" value={d.date} onChange={(e) => set({ date: e.target.value })} />
      </Field>
      <Field label="С">
        <Input type="time" className="w-24 bg-card" value={d.from} onChange={(e) => set({ from: e.target.value })} />
      </Field>
      <Field label="До">
        <Input type="time" className="w-24 bg-card" value={d.to} onChange={(e) => set({ to: e.target.value })} />
      </Field>
      <Field label="или минут">
        <Input
          inputMode="numeric"
          className="w-20 bg-card"
          value={d.minutes}
          disabled={!!d.to}
          onChange={(e) => set({ minutes: e.target.value })}
          placeholder="90"
        />
      </Field>
      <Field label="Что делал" className="min-w-48 flex-1">
        <Input className="bg-card" value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Вёрстка корзины" />
      </Field>
      <label className="flex h-9 items-center gap-2 px-1 text-[12.5px]">
        <Switch checked={d.billable} onCheckedChange={(billable) => set({ billable })} />
        Оплачиваемо
      </label>
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
  )
}

function useElapsed(startedAt: number | undefined): number {
  const [now, setNow] = useState(Date.now())
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
    <span className="font-display text-[34px] leading-none tabular-nums">
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
      <div className="flex items-center gap-4 rounded-3xl bg-lime px-5 py-4 text-lime-foreground">
        <Clock ms={elapsed} />
        <span className="min-w-0 flex-1 truncate text-[13px] opacity-75">{running.description || 'Таймер идёт'}</span>
        <Button onClick={() => stop.mutate(undefined)} className="bg-ink text-ink-foreground hover:bg-ink/90">
          <Pause /> Остановить
        </Button>
      </div>
    )
  }
  return (
    <form
      className="flex items-center gap-3 rounded-3xl bg-ink px-4 py-3 text-ink-foreground"
      onSubmit={(e) => {
        e.preventDefault()
        start.mutate({ projectId, description: description.trim() || undefined })
      }}
    >
      <button
        type="submit"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-lime-foreground transition-transform hover:scale-105"
        aria-label="Запустить таймер"
      >
        <Play className="size-5 fill-current" />
      </button>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Над чем работаете? Enter — запустить таймер"
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink-muted"
      />
      {running && (
        <span className="shrink-0 text-[12px] text-ink-muted">Сейчас идёт: {running.projectTitle} — будет остановлен</span>
      )}
    </form>
  )
}

function EntryRow({ entry, rate, currency }: { entry: TimeEntry; rate: number; currency: string }) {
  const [editing, setEditing] = useState(false)
  const update = useApiMutation('time', 'update', { onSuccess: () => setEditing(false) })
  const remove = useApiMutation('time', 'remove')
  if (editing) {
    return (
      <EntryForm
        initial={draftOf(entry)}
        submitLabel="Сохранить"
        onCancel={() => setEditing(false)}
        onSubmit={(d) => {
          const r = toRange(d)
          if (r) update.mutate({ id: entry.id, patch: { ...r, description: d.description, billable: d.billable } })
        }}
      />
    )
  }
  return (
    <div className="group flex items-center gap-4 rounded-xl px-3 py-2 hover:bg-surface">
      <span className="w-24 shrink-0 text-[12px] text-muted-foreground tabular-nums">
        {format(entry.startedAt, 'HH:mm')}–{entry.endedAt ? format(entry.endedAt, 'HH:mm') : '…'}
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-[13px]', !entry.description && 'text-muted-foreground')}>
        {entry.description || 'Без описания'}
      </span>
      {!entry.billable && <span className="text-[11.5px] text-muted-foreground">не оплачивается</span>}
      {entry.billable && rate > 0 && (
        <span className="text-[12px] text-muted-foreground tabular-nums">{fmtMoney((entry.minutes / 60) * rate, currency)}</span>
      )}
      <span className="w-20 text-right text-[13px] tabular-nums">{fmtMinutes(entry.minutes)}</span>
      <div className="flex opacity-0 group-hover:opacity-100">
        <Button variant="ghost" size="icon-xs" title="Изменить" onClick={() => setEditing(true)} disabled={!entry.endedAt}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-xs" title="Удалить" onClick={() => remove.mutate(entry.id)}>
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}

/** Time tracking for a project: live timer, manual entry, history grouped by day. */
export function TimeSection({
  projectId,
  entries,
  rate,
  currency,
  hourly
}: {
  projectId: string
  entries: TimeEntry[]
  rate: number
  currency: string
  hourly: boolean
}) {
  const [adding, setAdding] = useState(false)
  const create = useApiMutation('time', 'create', { successMessage: 'Время добавлено', onSuccess: () => setAdding(false) })

  const days = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const e of entries) map.set(dayKey(e.startedAt), [...(map.get(dayKey(e.startedAt)) ?? []), e])
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [entries])

  return (
    <Section
      title="Время"
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
          onCancel={() => setAdding(false)}
          onSubmit={(d) => {
            const r = toRange(d)
            if (r) create.mutate({ projectId, ...r, description: d.description, billable: d.billable })
          }}
        />
      )}
      {days.length === 0 && !adding && (
        <p className="text-[13px] text-muted-foreground">Запустите таймер или добавьте время вручную — часы попадут в расчёт оплаты.</p>
      )}
      <div className="flex flex-col gap-3">
        {days.slice(0, 30).map(([day, list]) => {
          const total = list.reduce((s, e) => s + e.minutes, 0)
          return (
            <div key={day}>
              <div className="mb-1 flex items-center justify-between px-3 text-[12px] text-muted-foreground">
                <span>{capitalize(format(new Date(`${day}T00:00`), 'EEEE, d MMMM', { locale: LOCALE }))}</span>
                <span className="font-medium text-foreground tabular-nums">{fmtMinutes(total)}</span>
              </div>
              {list.map((e) => (
                <EntryRow key={e.id} entry={e} rate={hourly ? rate : 0} currency={currency} />
              ))}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
