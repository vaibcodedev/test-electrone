import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  eventInputSchema,
  RECURRENCES,
  type CalendarEvent,
  type EventInput,
  type Recurrence
} from '@shared/domain/calendar'
import { limitsOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ColorSwatches } from '@/components/common/color-swatches'
import { DisabledHint } from '@/components/common/disabled-hint'
import { NO_CHANGES } from '@/lib/edit-session'
import { PALETTE } from '@shared/colors'

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
  { value: 'none', label: 'Без другого нагадування' },
  { value: '60', label: 'За годину' },
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

/** The palette's lime (first) is an event's default colour: it stands for `null` in the API, not a value. */
const DEFAULT_COLOR = PALETTE[0]
const SWATCH_NAMES = { [DEFAULT_COLOR]: 'Лаймовий (типовий)' }

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
  // A day picked in the grid comes as midnight → 10:00. «Подія» in the header passes «now»: round up to the
  // next half hour, so the event and its «за 15 хвилин» reminder aren't already in the past.
  if (start.getHours() === 0 && start.getMinutes() === 0) start.setHours(10, 0, 0, 0)
  else start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0)
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
  const [form, setForm] = useState<FormState>(() =>
    event ? fromEvent(event) : blank(date ?? new Date())
  )
  const [titleError, setTitleError] = useState<string>()
  // An existing event as it was when the dialog opened: «Зберегти» stays off until the form differs from it.
  const [baseline, setBaseline] = useState(() => (event ? JSON.stringify(fromEvent(event)) : null))
  const create = useApiMutation('events', 'create', { successMessage: 'Подію додано' })
  const update = useApiMutation('events', 'update', { successMessage: 'Збережено' })
  const remove = useApiMutation('events', 'remove', { successMessage: 'Подію переміщено в кошик' })

  // Reset once per opening (or when another event is opened), during render: a refetch of `event` while the
  // dialog is open must not wipe what was typed (docs/design-system.md → Сброс формы диалога).
  const session = open ? (event?.id ?? 'new') : ''
  const [lastSession, setLastSession] = useState(session)
  if (session !== lastSession) {
    setLastSession(session)
    if (open) {
      setForm(event ? fromEvent(event) : blank(date ?? new Date()))
      setBaseline(event ? JSON.stringify(fromEvent(event)) : null)
      setTitleError(undefined)
    }
  }

  const linked = !!event?.sourceType
  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((f) => ({ ...f, [key]: value }))
  const { startAt, endAt } = form
  const endBeforeStart = endAt !== null && startAt !== null && endAt < startAt
  // An empty title doesn't disable «Додати»: pressing it says what's missing at the field.
  const invalid = startAt === null || endBeforeStart
  const unchanged = !!event && baseline === JSON.stringify(form)
  // A colour outside the palette (older data) stays visible and chosen, first in the row.
  const swatches: readonly string[] =
    form.color && !(PALETTE as readonly string[]).includes(form.color)
      ? [form.color, ...PALETTE]
      : PALETTE

  const save = (): void => {
    // Enter can't be disabled like the button: a second submit while saving would create a duplicate.
    if (invalid || unchanged || startAt === null || create.isPending || update.isPending) return
    if (!form.title.trim()) {
      setTitleError('Введіть назву події')
      document.getElementById('event-title')?.focus()
      return
    }
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
    if (event)
      update.mutate(
        { id: event.id, patch: linked ? { ...input, title: event.title } : input },
        done
      )
    else create.mutate(input, done)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Never taller than the window: the fields scroll, the footer with «Зберегти» stays in view. */}
      <DialogContent className="max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)] rounded-3xl p-6 sm:max-w-135">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">
            {event ? 'Подія' : 'Нова подія'}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {/* Only the fields scroll; the footer sits below them, outside the scroll area.
              gutter auto: the global stable gutter made the right margin 40px against 30px on the left. */}
          <div className="-mx-6 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-1 scrollbar-gutter-auto">
            {linked ? (
              // The owning module controls the title: plain text, not a field that takes the cursor but no typing.
              <Field label="Назва">
                <p className="text-lead font-medium wrap-anywhere">{form.title}</p>
              </Field>
            ) : (
              <Field
                label="Назва"
                htmlFor="event-title"
                count={{ length: form.title.length, max: LIMITS.title }}
                error={titleError}
              >
                <Input
                  id="event-title"
                  autoFocus
                  value={form.title}
                  maxLength={LIMITS.title}
                  aria-invalid={!!titleError || undefined}
                  onChange={(e) => {
                    set('title', e.target.value)
                    setTitleError(undefined)
                  }}
                  placeholder="Дзвінок, дедлайн, нагадування…"
                  className="h-11 text-lead"
                />
              </Field>
            )}
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
                  setForm((f) => ({
                    ...f,
                    allDay,
                    startAt: convert(f.startAt, allDay),
                    endAt: convert(f.endAt, allDay)
                  }))
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
                      endAt:
                        f.endAt !== null && f.startAt !== null && v !== null
                          ? f.endAt + (v - f.startAt)
                          : f.endAt
                    }))
                  }
                  withTime={!form.allDay}
                  clearable={false}
                />
              </Field>
              <Field
                label="Кінець (необов’язково)"
                error={endBeforeStart ? 'Кінець раніше за початок — виправте дату' : undefined}
              >
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
                {/* No first reminder → no second one either. */}
                <Select
                  value={form.remind}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      remind: v,
                      remind2: v === 'none' ? 'none' : f.remind2
                    }))
                  }
                >
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
              {/* An old event may hold a second reminder without a first one: it stays visible until cleared. */}
              {(form.remind !== 'none' || form.remind2 !== 'none') && (
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
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Повтор">
                <Select
                  value={form.recurrence}
                  onValueChange={(v) => set('recurrence', v as Recurrence)}
                >
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
              <ColorSwatches
                colors={swatches}
                value={form.color ?? DEFAULT_COLOR}
                onChange={(c) => set('color', c === DEFAULT_COLOR ? null : c)}
                names={SWATCH_NAMES}
              />
            </Field>
            <Field
              label="Нотатки"
              htmlFor="event-notes"
              count={{ length: form.description.length, max: LIMITS.description }}
            >
              <Textarea
                id="event-notes"
                maxLength={LIMITS.description}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Порядок денний, посилання на дзвінок"
                // Grows with the text: one scroll for the whole dialog body, not a second one inside the field.
                className="max-h-none"
              />
            </Field>
          </div>
          <DialogFooter className="items-center gap-2 pt-3 sm:justify-between">
            {/* An event of a vacancy stage is removed with the stage, not here (main refuses it). */}
            {event && !linked ? (
              <Button
                type="button"
                variant="ghost"
                // Flush-left: the icon lines up with the fields above; hover tint is the only background.
                className="-ml-3 text-muted-foreground hover:text-destructive"
                disabled={remove.isPending}
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
              <DisabledHint reason={unchanged ? NO_CHANGES : undefined}>
                <Button
                  type="submit"
                  variant="lime"
                  disabled={invalid || unchanged || create.isPending || update.isPending}
                >
                  {event ? 'Зберегти' : 'Додати'}
                </Button>
              </DisabledHint>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
