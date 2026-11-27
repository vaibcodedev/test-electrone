import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  eventInputSchema,
  RECURRENCES,
  type CalendarEvent,
  type EventInput,
  type Recurrence
} from '@shared/domain/calendar'
import { limitsOf, requiredOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'
import {
  Dialog,
  DialogBody,
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
import { SubmitButton } from '@/components/common/submit-button'
import { NO_CHANGES } from '@/lib/edit-session'
import { useFormGate } from '@/hooks/use-form-gate'
import { FormAttemptContext } from '@/components/ui/field-control'
import { PALETTE } from '@shared/colors'
import { freshOnOpen } from '@/components/common/fresh-on-open'

const LIMITS = limitsOf(eventInputSchema)
const REQUIRED = requiredOf(eventInputSchema)

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
function EventDialogForm({
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
  // An existing event as it was when the dialog opened: «Зберегти» stays off until the form differs from it.
  const [baseline] = useState(() => (event ? JSON.stringify(fromEvent(event)) : null))
  const create = useApiMutation('events', 'create', { successMessage: 'Подію додано' })
  const update = useApiMutation('events', 'update', { successMessage: 'Збережено' })
  const remove = useApiMutation('events', 'remove', { successMessage: 'Подію переміщено в кошик' })

  const linked = !!event?.sourceType
  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void =>
    setForm((f) => ({ ...f, [key]: value }))
  const { startAt, endAt } = form
  const endBeforeStart = endAt !== null && startAt !== null && endAt < startAt
  const invalid = startAt === null || endBeforeStart
  const unchanged = !!event && baseline === JSON.stringify(form)
  // An empty title (required) or a field showing an error: «Додати» is off and Enter sends nothing (useFormGate).
  const { attach, reason: gateReason, attempted, submit } = useFormGate(open)
  const reason = gateReason ?? (unchanged ? NO_CHANGES : undefined)
  // A colour outside the palette (older data) stays visible and chosen, first in the row.
  const swatches: readonly string[] =
    form.color && !(PALETTE as readonly string[]).includes(form.color)
      ? [form.color, ...PALETTE]
      : PALETTE

  const save = (): void => {
    // Enter can't be disabled like the button: a second submit while saving would create a duplicate.
    if (invalid || unchanged || startAt === null || create.isPending || update.isPending) return
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
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-3xl p-6 sm:max-w-135">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">
            {event ? 'Подія' : 'Нова подія'}
          </DialogTitle>
        </DialogHeader>
        <form ref={attach} className="flex min-h-0 flex-col" onSubmit={(e) => submit(e, save)}>
          <FormAttemptContext.Provider value={attempted}>
            {/* Only the fields scroll; the footer sits below them, outside the scroll area. */}
            <DialogBody className="my-0 flex flex-1 flex-col gap-4">
              {linked ? (
                // The owning module controls the title: plain text, not a field that takes the cursor but no typing.
                <Field label="Назва">
                  <p className="text-lead font-medium wrap-anywhere">{form.title}</p>
                </Field>
              ) : (
                <Field label="Назва" htmlFor="event-title" required={REQUIRED.title}>
                  <Input
                    id="event-title"
                    autoFocus
                    value={form.title}
                    maxLength={LIMITS.title}
                    onChange={(e) => set('title', e.target.value)}
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
            </DialogBody>
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
                <SubmitButton
                  variant="lime"
                  reason={reason}
                  disabled={invalid}
                  pending={create.isPending || update.isPending}
                >
                  {event ? 'Зберегти' : 'Додати'}
                </SubmitButton>
              </div>
            </DialogFooter>
          </FormAttemptContext.Provider>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Created anew on each opening and for another event (freshOnOpen); a refetch of `event` while it is open keeps
 * what was typed.
 */
export const EventDialog = freshOnOpen(EventDialogForm, { identity: (p) => p.event?.id })
