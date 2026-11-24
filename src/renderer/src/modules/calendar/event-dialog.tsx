import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { eventInputSchema, RECURRENCES, type CalendarEvent, type EventInput, type Recurrence } from '@shared/domain/calendar'
import { limitsOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TAG_COLORS } from '@/components/common/tags'

const LIMITS = limitsOf(eventInputSchema)

const REMINDERS: { value: string; label: string }[] = [
  { value: 'none', label: 'Без нагадування' },
  { value: '0', label: 'У момент початку' },
  { value: '5', label: 'За 5 хвилин' },
  { value: '15', label: 'За 15 хвилин' },
  { value: '30', label: 'За 30 хвилин' },
  { value: '60', label: 'За годину' },
  { value: '1440', label: 'За день' }
]

const SECOND_REMINDERS: { value: string; label: string }[] = [
  { value: 'none', label: 'Ні' },
  { value: '60', label: 'За 1 годину' },
  { value: '180', label: 'За 3 години' },
  { value: '1440', label: 'За день' },
  { value: '2880', label: 'За 2 дні' }
]

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'Не повторювати',
  daily: 'Щодня',
  weekly: 'Щотижня',
  monthly: 'Щомісяця',
  yearly: 'Щороку'
}

/** Sentinel for "default colour" in the swatch ToggleGroup (null in the API). */
const DEFAULT_COLOR = 'default'

interface FormState {
  title: string
  description: string
  allDay: boolean
  startAt: number | null
  endAt: number | null
  remind: string
  remind2: string
  recurrence: Recurrence
  color: string | null
}

function fromEvent(e: CalendarEvent): FormState {
  return {
    title: e.title,
    description: e.description,
    allDay: e.allDay,
    startAt: e.startAt,
    endAt: e.endAt,
    remind: e.remindMinutes === null ? 'none' : String(e.remindMinutes),
    remind2: e.remind2Minutes === null ? 'none' : String(e.remind2Minutes),
    recurrence: e.recurrence,
    color: e.color
  }
}

function blank(date: Date): FormState {
  const start = new Date(date)
  if (start.getHours() === 0) start.setHours(10, 0, 0, 0)
  return {
    title: '',
    description: '',
    allDay: false,
    startAt: start.getTime(),
    endAt: null,
    remind: '15',
    remind2: 'none',
    recurrence: 'none',
    color: null
  }
}

/** Switching to all-day drops the time part (midnight); switching back restores 10:00. */
function convert(ts: number | null, toAllDay: boolean): number | null {
  if (ts === null) return null
  const d = new Date(ts)
  if (toAllDay) d.setHours(0, 0, 0, 0)
  else if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(10, 0, 0, 0)
  return d.getTime()
}

/**
 * Create/edit dialog for calendar events.
 * `event` = edit mode; otherwise `date` pre-fills a new event.
 */
export function EventDialog({
  open,
  onOpenChange,
  event,
  date
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  event?: CalendarEvent | null
  date?: Date | null
}) {
  const [form, setForm] = useState<FormState>(() => (event ? fromEvent(event) : blank(date ?? new Date())))
  const create = useApiMutation('events', 'create', { successMessage: 'Подію додано' })
  const update = useApiMutation('events', 'update', { successMessage: 'Збережено' })
  const remove = useApiMutation('events', 'remove', { successMessage: 'Подію переміщено в кошик' })

  useEffect(() => {
    if (open) setForm(event ? fromEvent(event) : blank(date ?? new Date()))
  }, [open, event, date])

  const linked = !!event?.sourceType
  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => setForm((f) => ({ ...f, [key]: value }))
  const { startAt, endAt } = form
  const endBeforeStart = endAt !== null && startAt !== null && endAt < startAt
  const invalid = !form.title.trim() || startAt === null || endBeforeStart

  const save = (): void => {
    if (invalid || startAt === null) return
    const input: EventInput = {
      title: form.title.trim(),
      description: form.description,
      allDay: form.allDay,
      startAt,
      endAt,
      remindMinutes: form.remind === 'none' ? null : Number(form.remind),
      remind2Minutes: form.remind2 === 'none' ? null : Number(form.remind2),
      recurrence: form.recurrence,
      color: form.color
    }
    const done = { onSuccess: () => onOpenChange(false) }
    // Synced events: the owning module controls the title.
    if (event) update.mutate({ id: event.id, patch: linked ? { ...input, title: event.title } : input }, done)
    else create.mutate(input, done)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl p-6 sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">{event ? 'Подія' : 'Нова подія'}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Field label="Назва" htmlFor="event-title" count={{ length: form.title.length, max: LIMITS.title }}>
            <Input
              id="event-title"
              autoFocus
              value={form.title}
              maxLength={LIMITS.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Дзвінок, дедлайн, нагадування…"
              className="h-11 text-lead"
              readOnly={linked}
            />
          </Field>
          {linked && (
            <p className="-mt-2 rounded-xl bg-surface px-3 py-2 text-caption text-muted-foreground">
              Створено з вакансії — час синхронізується з етапом співбесіди.
            </p>
          )}
          <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-2.5">
            <Label htmlFor="event-all-day" className="text-body text-foreground">
              Увесь день
            </Label>
            <Switch
              id="event-all-day"
              checked={form.allDay}
              onCheckedChange={(allDay) =>
                setForm((f) => ({ ...f, allDay, startAt: convert(f.startAt, allDay), endAt: convert(f.endAt, allDay) }))
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Початок">
              <DatePicker
                value={startAt}
                // Moving the start moves the end too, so the event keeps its length (like any calendar).
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    startAt: v,
                    endAt: f.endAt !== null && f.startAt !== null && v !== null ? f.endAt + (v - f.startAt) : f.endAt
                  }))
                }
                withTime={!form.allDay}
                clearable={false}
              />
            </Field>
            <Field label="Кінець (необов’язково)" error={endBeforeStart ? 'Кінець раніше за початок' : undefined}>
              <DatePicker
                value={endAt}
                onChange={(v) => set('endAt', v)}
                min={startAt}
                invalid={endBeforeStart}
                withTime={!form.allDay}
                placeholder="Не задано"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Нагадування">
              <Select value={form.remind} onValueChange={(v) => set('remind', v)}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDERS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Друге нагадування">
              <Select value={form.remind2} onValueChange={(v) => set('remind2', v)}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECOND_REMINDERS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Повтор">
              <Select value={form.recurrence} onValueChange={(v) => set('recurrence', v as Recurrence)}>
                <SelectTrigger className="w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RECURRENCE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Колір">
            <ToggleGroup
              type="single"
              value={form.color ?? DEFAULT_COLOR}
              onValueChange={(v) => v && set('color', v === DEFAULT_COLOR ? null : v)}
              spacing={1.5}
            >
              {[DEFAULT_COLOR, ...TAG_COLORS.slice(1)].map((c) => (
                <ToggleGroupItem
                  key={c}
                  value={c}
                  aria-label={c === DEFAULT_COLOR ? 'За замовчуванням' : c}
                  className="size-7 min-w-7 rounded-full p-0 ring-offset-2 ring-offset-card hover:opacity-90 on:ring-2 on:ring-foreground"
                  style={{ background: c === DEFAULT_COLOR ? 'var(--lime)' : c }}
                />
              ))}
            </ToggleGroup>
          </Field>
          <Field label="Нотатки" htmlFor="event-notes" count={{ length: form.description.length, max: LIMITS.description }}>
            <Textarea
              id="event-notes"
              maxLength={LIMITS.description}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Порядок денний, посилання на дзвінок"
            />
          </Field>
          <DialogFooter className="items-center gap-2 pt-1 sm:justify-between">
            {event ? (
              <Button
                type="button"
                variant="ghost"
                // Flush-left: the icon lines up with the fields above; hover tint is the only background.
                className="-ml-3 text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate(event.id, { onSuccess: () => onOpenChange(false) })}
              >
                <Trash2 /> У кошик
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
                Скасувати
              </Button>
              <Button type="submit" variant="lime" disabled={invalid || create.isPending || update.isPending}>
                {event ? 'Зберегти' : 'Додати'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
