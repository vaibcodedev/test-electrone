import { useId, useState, type ReactElement } from 'react'
import type { Currency } from '@shared/domain/crm'
import { expenseInputSchema, type Expense, type ExpenseCategory } from '@shared/domain/finance'
import { useApiMutation } from '@/lib/query'
import { limitsOf, rangesOf } from '@/lib/limits'
import { Field } from '@/components/common/page'
import { NumberField, useInvalidFields } from '@/components/common/number-field'
import { DatePicker } from '@/components/common/date-picker'
import { FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CategorySelect, CurrencySelect } from './finance-fields'

const EXP_L = limitsOf(expenseInputSchema)
const EXP_R = rangesOf(expenseInputSchema)

export function ExpenseDialog({
  open,
  onOpenChange,
  expense,
  defaultAt
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense?: Expense | null
  defaultAt: number
}): ReactElement {
  const e = expense
  const id = useId()
  const fields = useInvalidFields()
  const [title, setTitle] = useState(e?.title ?? '')
  const [titleTouched, setTitleTouched] = useState(false)
  const [amount, setAmount] = useState<number | null>(e?.amount ?? null)
  const [amountTouched, setAmountTouched] = useState(false)
  const [currency, setCurrency] = useState<Currency>(e?.currency ?? 'USD')
  const [category, setCategory] = useState<ExpenseCategory>(e?.category ?? 'other')
  const [at, setAt] = useState<number | null>(e?.at ?? defaultAt)
  const [note, setNote] = useState(e?.note ?? '')
  const create = useApiMutation('finance', 'createExpense', { successMessage: 'Витрату додано' })
  const update = useApiMutation('finance', 'updateExpense', { successMessage: 'Витрату збережено' })
  const payload = {
    title: title.trim(),
    amount: amount ?? 0,
    currency,
    category,
    at: at ?? defaultAt,
    note
  }
  const titleMissing = titleTouched && !payload.title

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={e ? 'Витрата' : 'Нова витрата'}
      description="Разова витрата. Регулярні платежі зручніше завести як підписку."
      submitLabel={e ? 'Зберегти' : 'Додати витрату'}
      invalid={!payload.title || !(payload.amount > 0) || fields.invalid}
      pending={create.isPending || update.isPending}
      onSubmit={async () => {
        if (e) await update.mutateAsync({ id: e.id, patch: payload })
        else await create.mutateAsync(payload)
        onOpenChange(false)
      }}
    >
      <Field
        label="На що"
        htmlFor={`${id}-title`}
        error={titleMissing ? 'Вкажіть назву' : undefined}
      >
        <Input
          id={`${id}-title`}
          autoFocus
          value={title}
          maxLength={EXP_L.title}
          aria-invalid={titleMissing || undefined}
          onChange={(ev) => setTitle(ev.target.value)}
          onBlur={() => setTitleTouched(true)}
          placeholder="Навушники, курс, домен…"
        />
      </Field>
      <div className="grid grid-cols-[1fr_120px] items-start gap-3">
        <NumberField
          id={`${id}-amount`}
          label="Сума"
          {...EXP_R.amount}
          value={amount}
          onCommit={(v) => {
            setAmount(v)
            setAmountTouched(true)
          }}
          onValidityChange={fields.report('amount')}
          hint={amountTouched && !(payload.amount > 0) ? 'Вкажіть суму більше 0' : undefined}
        />
        <Field label="Валюта" htmlFor={`${id}-currency`}>
          <CurrencySelect id={`${id}-currency`} value={currency} onChange={setCurrency} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Категорія" htmlFor={`${id}-category`}>
          <CategorySelect id={`${id}-category`} value={category} onChange={setCategory} />
        </Field>
        <Field label="Дата">
          <DatePicker value={at} onChange={setAt} clearable={false} />
        </Field>
      </div>
      <Field
        label="Нотатка (необов’язково)"
        htmlFor={`${id}-note`}
        count={{ length: note.length, max: EXP_L.note }}
      >
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={EXP_L.note}
          onChange={(ev) => setNote(ev.target.value)}
          className="min-h-14"
        />
      </Field>
    </FormDialog>
  )
}
