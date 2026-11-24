import { useState, type ReactNode } from 'react'
import { CURRENCIES, type Currency } from '@shared/domain/crm'
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type Subscription,
  type SubscriptionPeriod,
  type Withdrawal
} from '@shared/domain/finance'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtMoney } from '@/lib/format'
import { Field } from '@/components/common/page'
import { Segmented } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { CATEGORY_LABEL } from './parts'

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь'
]

const num = (v: string): number => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function CurrencySelect({ value, onChange }: { value: Currency; onChange: (c: Currency) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Currency)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function CategorySelect({
  value,
  onChange
}: {
  value: ExpenseCategory
  onChange: (c: ExpenseCategory) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ExpenseCategory)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {EXPENSE_CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  submitLabel,
  canSubmit,
  pending,
  onSubmit
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  submitLabel: string
  canSubmit: boolean
  pending?: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit && !pending) onSubmit()
          }}
        >
          {children}
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="lime" disabled={!canSubmit || pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ───────── Subscription ───────── */

export function SubscriptionDialog({
  open,
  onOpenChange,
  subscription
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription?: Subscription | null
}) {
  const s = subscription
  const [title, setTitle] = useState(s?.title ?? '')
  const [amount, setAmount] = useState(s ? String(s.amount) : '')
  const [currency, setCurrency] = useState<Currency>(s?.currency ?? 'USD')
  const [period, setPeriod] = useState<SubscriptionPeriod>(s?.period ?? 'monthly')
  const [billingDay, setBillingDay] = useState(String(s?.billingDay ?? new Date().getDate()))
  const [billingMonth, setBillingMonth] = useState(String(s?.billingMonth ?? new Date().getMonth()))
  const [category, setCategory] = useState<ExpenseCategory>(s?.category ?? 'subscription')
  const [url, setUrl] = useState(s?.url ?? '')
  const [note, setNote] = useState(s?.note ?? '')
  const [active, setActive] = useState(s?.active ?? true)
  const create = useApiMutation('finance', 'createSubscription', {
    successMessage: 'Подписка добавлена'
  })
  const update = useApiMutation('finance', 'updateSubscription', {
    successMessage: 'Подписка сохранена'
  })

  const payload = {
    title: title.trim(),
    amount: num(amount),
    currency,
    period,
    billingDay: Math.min(31, Math.max(1, Math.round(num(billingDay)) || 1)),
    billingMonth: Number(billingMonth),
    category,
    url: url.trim(),
    note,
    active
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={s ? 'Подписка' : 'Новая подписка'}
      description="Регулярный платёж: каждый месяц он появится в списке, и его можно отметить оплаченным."
      submitLabel={s ? 'Сохранить' : 'Добавить подписку'}
      canSubmit={!!payload.title && payload.amount > 0}
      pending={create.isPending || update.isPending}
      onSubmit={async () => {
        if (s) await update.mutateAsync({ id: s.id, patch: payload })
        else await create.mutateAsync(payload)
        onOpenChange(false)
      }}
    >
      <Field label="Название">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Claude Max, телефон, хостинг…"
        />
      </Field>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Сумма">
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Валюта">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
      </div>
      <Field label="Как часто">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'monthly', label: 'Каждый месяц' },
            { value: 'yearly', label: 'Раз в год' }
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="День списания">
          <Input
            type="number"
            min={1}
            max={31}
            value={billingDay}
            onChange={(e) => setBillingDay(e.target.value)}
          />
        </Field>
        {period === 'yearly' ? (
          <Field label="Месяц">
            <Select value={billingMonth} onValueChange={setBillingMonth}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field label="Категория">
            <CategorySelect value={category} onChange={setCategory} />
          </Field>
        )}
      </div>
      {period === 'yearly' && (
        <Field label="Категория">
          <CategorySelect value={category} onChange={setCategory} />
        </Field>
      )}
      <Field label="Ссылка (необязательно)">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </Field>
      <Field label="Заметка">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-14" />
      </Field>
      <div className="flex items-center gap-3">
        <Switch id="sub-active" checked={active} onCheckedChange={setActive} />
        <Label htmlFor="sub-active" className="text-body text-foreground">
          Активна — показывать в списке месяца
        </Label>
      </div>
    </FormDialog>
  )
}

/* ───────── Expense ───────── */

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
}) {
  const e = expense
  const [title, setTitle] = useState(e?.title ?? '')
  const [amount, setAmount] = useState(e ? String(e.amount) : '')
  const [currency, setCurrency] = useState<Currency>(e?.currency ?? 'USD')
  const [category, setCategory] = useState<ExpenseCategory>(e?.category ?? 'other')
  const [at, setAt] = useState<number | null>(e?.at ?? defaultAt)
  const [note, setNote] = useState(e?.note ?? '')
  const create = useApiMutation('finance', 'createExpense', { successMessage: 'Расход добавлен' })
  const update = useApiMutation('finance', 'updateExpense', { successMessage: 'Расход сохранён' })
  const payload = {
    title: title.trim(),
    amount: num(amount),
    currency,
    category,
    at: at ?? defaultAt,
    note
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={e ? 'Расход' : 'Новый расход'}
      description="Разовая трата. Регулярные платежи удобнее завести как подписку."
      submitLabel={e ? 'Сохранить' : 'Добавить расход'}
      canSubmit={!!payload.title && payload.amount > 0}
      pending={create.isPending || update.isPending}
      onSubmit={async () => {
        if (e) await update.mutateAsync({ id: e.id, patch: payload })
        else await create.mutateAsync(payload)
        onOpenChange(false)
      }}
    >
      <Field label="На что">
        <Input
          autoFocus
          value={title}
          onChange={(ev) => setTitle(ev.target.value)}
          placeholder="Наушники, курс, домен…"
        />
      </Field>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Field label="Сумма">
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(ev) => setAmount(ev.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Валюта">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Категория">
          <CategorySelect value={category} onChange={setCategory} />
        </Field>
        <Field label="Дата">
          <DatePicker value={at} onChange={setAt} clearable={false} />
        </Field>
      </div>
      <Field label="Заметка">
        <Textarea value={note} onChange={(ev) => setNote(ev.target.value)} className="min-h-14" />
      </Field>
    </FormDialog>
  )
}

/* ───────── Withdrawal ───────── */

const NO_PLATFORM = '__none__'

export function WithdrawalDialog({
  open,
  onOpenChange,
  withdrawal,
  defaultAt
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  withdrawal?: Withdrawal | null
  defaultAt: number
}) {
  const w = withdrawal
  const { data: platformList = [] } = useApi('platforms', 'list', { includeArchived: true })
  const [platformId, setPlatformId] = useState<string>(w?.platformId ?? NO_PLATFORM)
  const [amount, setAmount] = useState(w ? String(w.amount) : '')
  const [currency, setCurrency] = useState<Currency>(w?.currency ?? 'USD')
  const [fee, setFee] = useState(w ? String(w.fee) : '0')
  const [rate, setRate] = useState(w ? String(w.rate) : '1')
  const [receivedCurrency, setReceivedCurrency] = useState<Currency>(w?.receivedCurrency ?? 'UAH')
  const [received, setReceived] = useState(w ? String(w.received) : '')
  const [method, setMethod] = useState(w?.method ?? '')
  const [at, setAt] = useState<number | null>(w?.at ?? defaultAt)
  const [note, setNote] = useState(w?.note ?? '')
  const create = useApiMutation('finance', 'createWithdrawal', { successMessage: 'Вывод добавлен' })
  const update = useApiMutation('finance', 'updateWithdrawal', { successMessage: 'Вывод сохранён' })

  const estimate = Math.max(0, Math.round((num(amount) - num(fee)) * num(rate) * 100) / 100)
  const receivedValue = received.trim() ? num(received) : null
  const payload = {
    platformId: platformId === NO_PLATFORM ? null : platformId,
    amount: num(amount),
    currency,
    fee: num(fee),
    rate: num(rate) || 1,
    receivedCurrency,
    received: receivedValue,
    method: method.trim(),
    at: at ?? defaultAt,
    note
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={w ? 'Вывод' : 'Новый вывод'}
      description="Сколько вывел с платформы, сколько ушло на комиссию и сколько реально пришло."
      submitLabel={w ? 'Сохранить' : 'Добавить вывод'}
      canSubmit={payload.amount > 0}
      pending={create.isPending || update.isPending}
      onSubmit={async () => {
        if (w) await update.mutateAsync({ id: w.id, patch: payload })
        else await create.mutateAsync(payload)
        onOpenChange(false)
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Откуда">
          <Select value={platformId} onValueChange={setPlatformId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PLATFORM}>Другое</SelectItem>
              {platformList.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Дата">
          <DatePicker value={at} onChange={setAt} clearable={false} />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_1fr_110px] gap-3">
        <Field label="Сумма">
          <Input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Комиссия за вывод">
          <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Валюта">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_1fr_110px] gap-3">
        <Field label={`Курс: 1 ${currency} =`}>
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Пришло (если знаешь)">
          <Input
            inputMode="decimal"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            placeholder={String(estimate)}
          />
        </Field>
        <Field label="Валюта">
          <CurrencySelect value={receivedCurrency} onChange={setReceivedCurrency} />
        </Field>
      </div>
      <div className="rounded-xl bg-surface px-4 py-3 text-body">
        <span className="text-muted-foreground">Придёт ≈ </span>
        <span className="font-medium tabular-nums">
          {fmtMoney(receivedValue ?? estimate, receivedCurrency)}
        </span>
        <span className="text-muted-foreground">
          {' '}
          = ({fmtMoney(num(amount), currency)} − {fmtMoney(num(fee), currency)}) × {num(rate) || 1}
        </span>
      </div>
      <Field label="Способ">
        <Input
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          placeholder="Payoneer, карта, Wise…"
        />
      </Field>
      <Field label="Заметка">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-14" />
      </Field>
    </FormDialog>
  )
}
