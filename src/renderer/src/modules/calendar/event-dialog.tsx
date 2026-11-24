import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { RECURRENCES, type CalendarEvent, type EventInput, type Recurrence } from '@shared/domain/calendar'
import { useApiMutation } from '@/lib/query'
import { fromLocalInput, toLocalInput } from '@/lib/format'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/common/page'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TAG_COLORS } from '@/components/common/tags'
import { cn } from '@/lib/utils'

const REMINDERS: { value: string; label: string }[] = [
  { value: 'none', label: 'Без напоминания' },
  { value: '0', label: 'В момент начала' },
  { value: '5', label: 'За 5 минут' },
  { value: '15', label: 'За 15 минут' },
  { value: '30', label: 'За 30 минут' },
  { value: '60', label: 'За час' },
  { value: '1440', label: 'За день' }
]

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'Не повторять',
  daily: 'Каждый день',
  weekly: 'Каждую неделю',
  monthly: 'Каждый месяц',
  yearly: 'Каждый год'
}

interface FormState {
  title: string
  description: string
  allDay: boolean
  start: string
  end: string
  remind: string
  recurrence: Recurrence
  color: string | null
}

function fromEvent(e: CalendarEvent): FormState {
  return {
    title: e.title,
    description: e.description,
    allDay: e.allDay,
    start: toLocalInput(e.startAt, !e.allDay),
    end: toLocalInput(e.endAt, !e.allDay),
    remind: e.remindMinutes === null ? 'none' : String(e.remindMinutes),
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
    start: toLocalInput(start.getTime()),
    end: '',
    remind: '15',
    recurrence: 'none',
    color: null
  }
}

/** Switching all-day keeps the date and drops/restores the time part. */
function convertInput(value: string, toAllDay: boolean): string {
  if (!value) return ''
  if (toAllDay) return value.slice(0, 10)
  return value.length === 10 ? `${value}T10:00` : value
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
  const create = useApiMutation('events', 'create', { successMessage: 'Событие добавлено' })
  const update = useApiMutation('events', 'update', { successMessage: 'Сохранено' })
  const remove = useApiMutation('events', 'remove', { successMessage: 'Событие в корзине' })

  useEffect(() => {
    if (open) setForm(event ? fromEvent(event) : blank(date ?? new Date()))
  }, [open, event, date])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => setForm((f) => ({ ...f, [key]: value }))
  const startAt = fromLocalInput(form.start)
  const endAt = fromLocalInput(form.end)
  const invalid = !form.title.trim() || startAt === null || (endAt !== null && endAt < startAt)

  const save = (): void => {
    if (invalid || startAt === null) return
    const input: EventInput = {
      title: form.title.trim(),
      description: form.description,
      allDay: form.allDay,
      startAt,
      endAt,
      remindMinutes: form.remind === 'none' ? null : Number(form.remind),
      recurrence: form.recurrence,
      color: form.color
    }
    const done = { onSuccess: () => onOpenChange(false) }
    if (event) update.mutate({ id: event.id, patch: input }, done)
    else create.mutate(input, done)
  }

  const inputType = form.allDay ? 'date' : 'datetime-local'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl p-6 sm:max-w-[520px]">
        <DialogTitle className="font-display text-xl">{event ? 'Событие' : 'Новое событие'}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <Input
            autoFocus
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Созвон, дедлайн, напоминание…"
            className="h-11 text-[15px]"
          />
          <label className="flex items-center justify-between rounded-2xl bg-surface px-4 py-2.5 text-[13px]">
            Весь день
            <Switch
              checked={form.allDay}
              onCheckedChange={(allDay) =>
                setForm((f) => ({ ...f, allDay, start: convertInput(f.start, allDay), end: convertInput(f.end, allDay) }))
              }
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Начало">
              <Input type={inputType} value={form.start} onChange={(e) => set('start', e.target.value)} />
            </Field>
            <Field label="Конец (необязательно)">
              <Input
                type={inputType}
                value={form.end}
                min={form.start}
                onChange={(e) => set('end', e.target.value)}
                aria-invalid={endAt !== null && startAt !== null && endAt < startAt}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Напоминание">
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
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted-foreground">Цвет</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => set('color', null)}
                className={cn(
                  'size-7 rounded-full bg-lime ring-offset-2 ring-offset-card',
                  form.color === null && 'ring-2 ring-foreground'
                )}
                aria-label="По умолчанию"
              />
              {TAG_COLORS.slice(1).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('color', c)}
                  className={cn('size-7 rounded-full ring-offset-2 ring-offset-card', form.color === c && 'ring-2 ring-foreground')}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Заметки, ссылка на созвон" />
          <div className="flex items-center gap-2 pt-1">
            {event && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => remove.mutate(event.id, { onSuccess: () => onOpenChange(false) })}
              >
                <Trash2 /> В корзину
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="soft" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="lime" disabled={invalid || create.isPending || update.isPending}>
              {event ? 'Сохранить' : 'Добавить'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
