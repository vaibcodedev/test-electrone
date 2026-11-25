import { useId, useState, type ReactElement } from 'react'
import { NumberInput } from '@/components/common/number-input'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { DisabledHint } from '@/components/common/disabled-hint'
import { NO_CHANGES } from '@/lib/edit-session'
import { Field as UiField, FieldLabel } from '@/components/ui/field'
import { draftToNumber, numberToDraft } from './money'
import { escapeCloses } from './inline-form'
import { DESC_MAX, startOfDayMs, toRange, type EntryDraft } from './time-range'

/** Manual time entry: a day, then «З–До» or a number of minutes. Esc cancels. */
export function EntryForm({
  initial,
  submitLabel,
  showBillable,
  pending,
  edit = false,
  onSubmit,
  onCancel
}: {
  initial: EntryDraft
  submitLabel: string
  /** Changes an existing entry: the submit waits until something differs from `initial`. */
  edit?: boolean
  showBillable: boolean
  /** The save is in flight: a second Enter / click must not add a duplicate. */
  pending: boolean
  onSubmit: (d: EntryDraft) => void
  onCancel: () => void
}): ReactElement {
  const [d, setD] = useState(initial)
  const uid = useId()
  const set = (patch: Partial<EntryDraft>): void => setD((x) => ({ ...x, ...patch }))
  const range = toRange(d)
  const overnight = !!range && !!d.from && !!d.to && d.to < d.from
  const unchanged = edit && JSON.stringify(d) === JSON.stringify(initial)
  return (
    <Card className="p-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onKeyDown={escapeCloses(onCancel)}
        onSubmit={(e) => {
          e.preventDefault()
          if (range && !pending && !unchanged) onSubmit(d)
        }}
      >
        <Field label="Дата" className="w-44">
          <DatePicker
            value={d.day}
            clearable={false}
            onChange={(v) => v && set({ day: startOfDayMs(v) })}
          />
        </Field>
        <Field label="З" htmlFor={`${uid}-from`} className="w-24">
          <Input
            id={`${uid}-from`}
            autoFocus
            type="time"
            value={d.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </Field>
        <Field label="До" htmlFor={`${uid}-to`} className="w-24">
          <Input
            id={`${uid}-to`}
            type="time"
            value={d.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </Field>
        <Field label="або хвилин" htmlFor={`${uid}-minutes`} className="w-24">
          <NumberInput
            id={`${uid}-minutes`}
            integer
            allowEmpty
            min={1}
            max={1440}
            value={draftToNumber(d.minutes)}
            disabled={!!d.to}
            onChange={(v) => set({ minutes: numberToDraft(v) })}
            placeholder="Напр.: 90"
          />
        </Field>
        <Field label="Що зроблено" htmlFor={`${uid}-desc`} className="min-w-48 flex-1">
          <Input
            id={`${uid}-desc`}
            value={d.description}
            maxLength={DESC_MAX}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Напр.: Верстка кошика"
          />
        </Field>
        {showBillable && (
          <UiField orientation="horizontal" className="h-9 w-auto gap-2">
            <Switch
              id={`${uid}-billable`}
              checked={d.billable}
              onCheckedChange={(billable) => set({ billable })}
            />
            <FieldLabel htmlFor={`${uid}-billable`} className="text-foreground">
              Оплачувано
            </FieldLabel>
          </UiField>
        )}
        {/* The reason the button is off comes before it; buttons on the right, as in the stage and access forms. */}
        {!range && (
          <p className="w-full text-caption text-muted-foreground">
            Вкажіть час З–До або кількість хвилин.
          </p>
        )}
        {overnight && (
          <p className="w-full text-caption text-muted-foreground">
            Кінець раніше за початок — рахуємо до {d.to} наступного дня.
          </p>
        )}
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Скасувати
          </Button>
          <DisabledHint reason={unchanged ? NO_CHANGES : undefined}>
            <Button type="submit" variant="subtle" disabled={!range || pending || unchanged}>
              {submitLabel}
            </Button>
          </DisabledHint>
        </div>
      </form>
    </Card>
  )
}
