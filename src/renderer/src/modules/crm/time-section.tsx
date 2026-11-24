import { useEffect, useMemo, useState } from 'react'
import { EditableScope } from '@/components/common/detail-mode-context'
import { format } from 'date-fns'
import { Pencil, Play, Plus, Square, Trash2 } from 'lucide-react'
import { timeEntryInputSchema, type RunningTimer, type TimeEntry } from '@shared/domain/crm'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
import { NumberInput } from '@/components/common/number-input'
import { draftToNumber, numberToDraft } from './money'
import { startOfDayMs, toRange, type EntryDraft } from './time-range'
import { toast } from 'sonner'
import { limitsOf } from '@/lib/limits'
import { LOCALE, dayKey, fmtMinutes, fmtMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Field as UiField, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupInput } from '@/components/ui/input-group'
import { useAutosave } from '@/hooks/use-autosave'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { cn } from '@/lib/utils'
import { Section } from './parts'

const DESC_MAX = limitsOf(timeEntryInputSchema).description

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

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

function EntryForm({
  initial,
  submitLabel,
  showBillable,
  pending,
  onSubmit,
  onCancel
}: {
  initial: EntryDraft
  submitLabel: string
  showBillable: boolean
  /** The save is in flight: a second Enter / click must not add a duplicate. */
  pending: boolean
  onSubmit: (d: EntryDraft) => void
  onCancel?: () => void
}) {
  const [d, setD] = useState(initial)
  const set = (patch: Partial<EntryDraft>): void => setD((x) => ({ ...x, ...patch }))
  const range = toRange(d)
  const overnight = !!range && !!d.from && !!d.to && d.to < d.from
  return (
    <Card className="p-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (range && !pending) onSubmit(d)
        }}
      >
        <Field label="Дата" className="w-44">
          <DatePicker
            value={d.day}
            clearable={false}
            onChange={(v) => v && set({ day: startOfDayMs(v) })}
          />
        </Field>
        <Field label="З" className="w-24">
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
        <Field label="або хвилин" className="w-24">
          <NumberInput
            className="bg-card"
            integer
            allowEmpty
            min={1}
            max={1440}
            value={draftToNumber(d.minutes)}
            disabled={!!d.to}
            onChange={(v) => set({ minutes: numberToDraft(v) })}
            placeholder="90"
          />
        </Field>
        <Field label="Що робив" className="min-w-48 flex-1">
          <Input
            className="bg-card"
            value={d.description}
            maxLength={DESC_MAX}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Верстка кошика"
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
              Оплачувано
            </FieldLabel>
          </UiField>
        )}
        <div className="flex gap-1">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Скасувати
            </Button>
          )}
          <Button type="submit" variant="lime" disabled={!range || pending}>
            {submitLabel}
          </Button>
        </div>
        {overnight && (
          <p className="w-full text-caption text-muted-foreground">
            Кінець раніше за початок — рахуємо до {d.to} наступного дня.
          </p>
        )}
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

/** "<1 хв" for short entries, otherwise «1 год 5 хв». */
const fmtDuration = (min: number): string => (min < 1 ? '<1 хв' : fmtMinutes(min))

function Clock({ ms }: { ms: number }) {
  const s = Math.floor(ms / 1000)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return (
    <span className="font-display text-stat-sm leading-none tabular-nums">
      {hh}:{mm}
      <span className="text-muted-foreground">:{ss}</span>
    </span>
  )
}

/** Running timer: calm raised bar, elapsed clock, inline-editable description saved to the entry. */
function RunningBar({ running }: { running: RunningTimer }) {
  const elapsed = useElapsed(running.startedAt)
  const update = useApiMutation('time', 'update', { silent: true })
  // The server drops a timer stopped in under a minute and returns null.
  const stop = useApiMutation('time', 'stop', {
    onSuccess: (entry) =>
      entry ? toast.success('Час записано') : toast.info('Менше хвилини — запис не збережено')
  })
  const [description, setDescription] = useAutosave(running.description, (v) =>
    update.mutate({ id: running.id, patch: { description: v.trim() } })
  )
  return (
    <Card className="flex-row items-center gap-4 bg-card px-5 py-3.5 ring-1 ring-foreground/10">
      <span
        className="size-2 shrink-0 animate-pulse rounded-full bg-lime"
        aria-label="Таймер іде"
      />
      <div className="flex shrink-0 flex-col gap-1">
        <Clock ms={elapsed} />
        <span className="text-meta text-muted-foreground tabular-nums">
          з {format(running.startedAt, 'HH:mm')}
        </span>
      </div>
      <Input
        value={description}
        maxLength={DESC_MAX}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Що робите? Можна дописати на ходу"
        aria-label="Опис поточної роботи"
        className="min-w-0 flex-1"
      />
      <Button variant="outline" onClick={() => stop.mutate(undefined)}>
        <Square className="fill-current" /> Зупинити
      </Button>
    </Card>
  )
}

/** Idle: one input + «Почати» (Enter starts); recent descriptions as quick-start chips. */
function StartBar({
  projectId,
  recent,
  otherRunning
}: {
  projectId: string
  recent: string[]
  otherRunning?: RunningTimer | null
}) {
  const [description, setDescription] = useState('')
  const start = useApiMutation('time', 'start', { onSuccess: () => setDescription('') })
  const go = (text: string): void => {
    if (start.isPending) return
    start.mutate({ projectId, description: text.trim() || undefined })
  }
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          go(description)
        }}
      >
        <InputGroup className="flex-1">
          <InputGroupInput
            value={description}
            maxLength={DESC_MAX}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Над чим працюєте?"
            aria-label="Над чим працюєте"
          />
        </InputGroup>
        <Button type="submit" disabled={start.isPending}>
          <Play className="fill-current" /> Почати
        </Button>
      </form>
      {(recent.length > 0 || otherRunning) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {recent.map((r) => (
            <Button key={r} variant="subtle" size="xs" className="max-w-56" onClick={() => go(r)}>
              <Play className="size-3" />
              <span className="truncate">{r}</span>
            </Button>
          ))}
          {otherRunning && (
            <span className="text-caption text-muted-foreground">
              Зараз іде таймер у «{otherRunning.projectTitle}» — його буде зупинено
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Shared grid: range · description · money/badge · duration · actions — day totals use the same columns. */
/** Rows shown per day before «ще N». */
const DAY_LIMIT = 8

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
}) {
  const [editing, setEditing] = useState(false)
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
      <span className={cn('truncate text-body', !entry.description && 'text-muted-foreground')}>
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
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Змінити"
          onClick={() => setEditing(true)}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Видалити"
          className="hover:text-destructive"
          onClick={() => remove.mutate(entry.id)}
        >
          <Trash2 />
        </Button>
      </span>
    </div>
  )
}

/**
 * Time tracking for a project: live timer, manual entry, history grouped by day.
 * For hourly projects it drives the money; for others it is a secondary "how long it really took" log.
 */
export function TimeSection({
  projectId,
  rate,
  currency,
  hourly,
  secondary
}: {
  projectId: string
  /** @deprecated history is fetched here by date range; kept for call-site compatibility. */
  entries?: TimeEntry[]
  rate: number
  currency: string
  hourly: boolean
  secondary?: boolean
}) {
  const [adding, setAdding] = useState(false)
  // History is bounded: the last 14 days first, «Показати раніші» adds a week at a time.
  const [weeksBack, setWeeksBack] = useState(0)
  const [today] = useState(() => startOfDayMs(Date.now()))
  const from = today - (13 + weeksBack * 7) * 86_400_000
  const { data: entries = [], isPending } = useApi('time', 'list', { projectId, from }, KEEP_PERIOD)
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const create = useApiMutation('time', 'create', {
    successMessage: 'Час додано',
    onSuccess: () => setAdding(false)
  })

  // The running entry is shown as the timer bar, not as a history row.
  const { data: running } = useApi('time', 'running')
  const finished = useMemo(() => entries.filter((e) => e.endedAt !== null), [entries])
  const days = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const e of finished)
      map.set(dayKey(e.startedAt), [...(map.get(dayKey(e.startedAt)) ?? []), e])
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [finished])
  const recent = useMemo(
    () => [...new Set(finished.map((e) => e.description.trim()).filter(Boolean))].slice(0, 3),
    [finished]
  )
  const mine = running && running.projectId === projectId ? running : null

  return (
    <Section
      title={secondary ? 'Облік часу' : 'Час'}
      hint={
        secondary ? 'Для себе: скільки насправді йде на проєкт. На оплату не впливає.' : undefined
      }
      action={
        !adding && (
          <Button variant="soft" size="sm" data-edit-only onClick={() => setAdding(true)}>
            <Plus /> Вручну
          </Button>
        )
      }
    >
      {mine ? (
        <RunningBar key={mine.id} running={mine} />
      ) : (
        // The timer is an action, not an edit of the project: it works while reading too.
        <EditableScope>
          <StartBar projectId={projectId} recent={recent} otherRunning={running} />
        </EditableScope>
      )}
      {adding && (
        <EntryForm
          initial={emptyDraft()}
          submitLabel="Додати"
          showBillable={hourly}
          pending={create.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(d) => {
            const r = toRange(d)
            if (r && !create.isPending)
              create.mutate({ projectId, ...r, description: d.description, billable: d.billable })
          }}
        />
      )}
      {days.length === 0 && !adding && !mine && weeksBack === 0 && !isPending && (
        <p className="text-body text-muted-foreground">
          {hourly
            ? 'Запустіть таймер або додайте час вручну — години потраплять у розрахунок оплати.'
            : 'Запустіть таймер, щоб бачити фактичну ставку проєкту.'}
        </p>
      )}
      <div className="flex flex-col gap-4">
        {days.map(([day, list]) => {
          const total = list.reduce((sum, e) => sum + e.minutes, 0)
          const expanded = openDays.has(day)
          const shown = expanded ? list : list.slice(0, DAY_LIMIT)
          return (
            <div key={day} className="flex flex-col gap-0.5">
              <div className={cn(ROW_GRID, 'pb-1 text-caption')}>
                <span className="col-span-3 font-medium text-muted-foreground">
                  {capitalize(format(new Date(`${day}T00:00`), 'EEEE, d MMMM', { locale: LOCALE }))}
                </span>
                <span className="text-right font-semibold tabular-nums">{fmtDuration(total)}</span>
                <span />
              </div>
              {shown.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  rate={hourly ? rate : 0}
                  currency={currency}
                  showBillable={hourly}
                />
              ))}
              {list.length > DAY_LIMIT && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-1 w-fit text-muted-foreground"
                  onClick={() =>
                    setOpenDays((prev) => {
                      const next = new Set(prev)
                      if (expanded) next.delete(day)
                      else next.add(day)
                      return next
                    })
                  }
                >
                  {expanded ? 'Згорнути' : `ще ${list.length - DAY_LIMIT}`}
                </Button>
              )}
            </div>
          )
        })}
        {days.length === 0 && weeksBack > 0 && (
          <p className="text-caption text-muted-foreground">За ці дні записів немає.</p>
        )}
        {(days.length > 0 || weeksBack > 0) && (
          <Button
            variant="subtle"
            size="sm"
            className="w-fit"
            onClick={() => setWeeksBack((w) => w + 1)}
          >
            Показати раніші · ще тиждень
          </Button>
        )}
      </div>
    </Section>
  )
}
