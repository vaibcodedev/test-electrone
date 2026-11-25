import { useId, useState, type ReactElement } from 'react'
import type { Currency } from '@shared/domain/crm'
import {
  subscriptionInputSchema,
  type ExpenseCategory,
  type Subscription,
  type SubscriptionPeriod
} from '@shared/domain/finance'
import { useApiMutation } from '@/lib/query'
import { isLikelyUrl, limitsOf, rangesOf, URL_ERROR } from '@/lib/limits'
import { normalizeUrl } from '@/lib/open-url'
import { Field, Segmented } from '@/components/common/page'
import { NumberField, useInvalidFields } from '@/components/common/number-field'
import { FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { CurrencySelect } from '@/components/common/currency-select'
import { CategorySelect } from './finance-fields'
import { MONTH_NAMES, monthRange } from './month'

const SUB_L = limitsOf(subscriptionInputSchema)
const SUB_R = rangesOf(subscriptionInputSchema)

export function SubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  month
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription?: Subscription | null
  /** Month the list is showing: a new subscription starts from it, not from the beginning of time. */
  month: string
}): ReactElement {
  const s = subscription
  const id = useId()
  const fields = useInvalidFields()
  const [title, setTitle] = useState(s?.title ?? '')
  const [titleTouched, setTitleTouched] = useState(false)
  const [amount, setAmount] = useState<number | null>(s?.amount ?? null)
  const [amountTouched, setAmountTouched] = useState(false)
  const [currency, setCurrency] = useState<Currency>(s?.currency ?? 'USD')
  const [period, setPeriod] = useState<SubscriptionPeriod>(s?.period ?? 'monthly')
  const [billingDay, setBillingDay] = useState<number | null>(s?.billingDay ?? new Date().getDate())
  // A yearly one added while a month is shown bills in that month, so it appears in that list at once.
  const [billingMonth, setBillingMonth] = useState(
    String(s?.billingMonth ?? Number(month.slice(5)) - 1)
  )
  const [category, setCategory] = useState<ExpenseCategory>(s?.category ?? 'subscription')
  const [url, setUrl] = useState(s?.url ?? '')
  const [note, setNote] = useState(s?.note ?? '')
  const [active, setActive] = useState(s?.active ?? true)
  const create = useApiMutation('finance', 'createSubscription', {
    successMessage: 'Підписку додано'
  })
  const update = useApiMutation('finance', 'updateSubscription', {
    successMessage: 'Підписку збережено'
  })

  const payload = {
    title: title.trim(),
    amount: amount ?? 0,
    currency,
    period,
    billingDay: billingDay ?? 1,
    billingMonth: Number(billingMonth),
    category,
    url: normalizeUrl(url),
    note,
    active
  }
  const titleMissing = titleTouched && !payload.title

  const categoryField = (
    <Field label="Категорія" htmlFor={`${id}-category`}>
      <CategorySelect id={`${id}-category`} value={category} onChange={setCategory} />
    </Field>
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={s ? 'Підписка' : 'Нова підписка'}
      description={
        period === 'yearly'
          ? 'Річний платіж: у місяць списання він з’явиться в списку, і його можна позначити оплаченим.'
          : 'Регулярний платіж: щомісяця він з’явиться в списку, і його можна позначити оплаченим.'
      }
      submitLabel={s ? 'Зберегти' : 'Додати підписку'}
      invalid={
        !payload.title ||
        !(payload.amount > 0) ||
        billingDay === null ||
        !isLikelyUrl(url) ||
        fields.invalid
      }
      pending={create.isPending || update.isPending}
      onSubmit={async () => {
        // startedAt only on create: a patch without it keeps the stored value (patchOf).
        if (s) await update.mutateAsync({ id: s.id, patch: payload })
        else await create.mutateAsync({ ...payload, startedAt: monthRange(month)[0] })
        onOpenChange(false)
      }}
    >
      <Field
        label="Назва"
        htmlFor={`${id}-title`}
        error={titleMissing ? 'Вкажіть назву' : undefined}
      >
        <Input
          id={`${id}-title`}
          autoFocus
          value={title}
          maxLength={SUB_L.title}
          aria-invalid={titleMissing || undefined}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTitleTouched(true)}
          placeholder="Claude Max, телефон, хостинг…"
        />
      </Field>
      <div className="grid grid-cols-[1fr_120px] items-start gap-3">
        <NumberField
          id={`${id}-amount`}
          label="Сума"
          live
          {...SUB_R.amount}
          value={amount}
          onCommit={(v) => {
            setAmount(v)
            setAmountTouched(true)
          }}
          onValidityChange={fields.report('amount')}
          error={amountTouched && !(payload.amount > 0) ? 'Вкажіть суму більше 0' : undefined}
        />
        <Field label="Валюта" htmlFor={`${id}-currency`}>
          <CurrencySelect id={`${id}-currency`} value={currency} onChange={setCurrency} />
        </Field>
      </div>
      <Field label="Як часто">
        <Segmented
          className="w-fit"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'monthly', label: 'Щомісяця' },
            { value: 'yearly', label: 'Раз на рік' }
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 items-start gap-3">
        <NumberField
          id={`${id}-day`}
          label="День списання"
          integer
          live
          {...SUB_R.billingDay}
          value={billingDay}
          onCommit={setBillingDay}
          onValidityChange={fields.report('billingDay')}
          error={billingDay === null ? 'Вкажіть день місяця' : undefined}
        />
        {period === 'yearly' ? (
          <Field label="Місяць" htmlFor={`${id}-month`}>
            <Select value={billingMonth} onValueChange={setBillingMonth}>
              <SelectTrigger id={`${id}-month`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          categoryField
        )}
      </div>
      {period === 'yearly' && categoryField}
      <Field
        label="Посилання (необов’язково)"
        htmlFor={`${id}-url`}
        error={isLikelyUrl(url) ? undefined : URL_ERROR}
      >
        <Input
          id={`${id}-url`}
          type="url"
          value={url}
          maxLength={SUB_L.url}
          aria-invalid={!isLikelyUrl(url) || undefined}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </Field>
      <Field
        label="Нотатка (необов’язково)"
        htmlFor={`${id}-note`}
        count={{ length: note.length, max: SUB_L.note }}
      >
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={SUB_L.note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-14"
        />
      </Field>
      {/* Only when editing: a new one switched off would vanish from the list right after «додано». */}
      {s && (
        <div className="flex items-center gap-3">
          <Switch id={`${id}-active`} checked={active} onCheckedChange={setActive} />
          <Label htmlFor={`${id}-active`} className="text-body text-foreground">
            Активна — показувати в списку місяця
          </Label>
        </div>
      )}
    </FormDialog>
  )
}
