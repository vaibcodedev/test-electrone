import { useId, useState, type ReactElement } from 'react'
import type { Currency } from '@shared/domain/crm'
import { withdrawalInputSchema, type Withdrawal } from '@shared/domain/finance'
import { useApi, useApiMutation } from '@/lib/query'
import { limitsOf, rangesOf } from '@/lib/limits'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Field } from '@/components/common/page'
import { NumberField, useInvalidFields } from '@/components/common/number-field'
import { DatePicker } from '@/components/common/date-picker'
import { FormDialog } from '@/components/common/form-dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { CurrencySelect } from '@/components/common/currency-select'
import { fmtRate } from './money'

const WD_L = limitsOf(withdrawalInputSchema)
const WD_R = rangesOf(withdrawalInputSchema)

const NO_PLATFORM = '__none__'

/** (amount − fee) × rate, never below 0 — the same rule main uses when «received» is empty. */
const receivedOf = (amount: number, fee: number, rate: number): number =>
  Math.max(0, Math.round((amount - fee) * rate * 100) / 100)

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
}): ReactElement {
  const w = withdrawal
  const id = useId()
  const fields = useInvalidFields()
  const { data: platformList = [] } = useApi('platforms', 'list', { includeArchived: true })
  const { data: overview } = useApi('finance', 'overview')
  // Without arguments: every withdrawal, newest first — the last rate of the pair is the default.
  const { data: history = [] } = useApi('finance', 'withdrawals')
  // Untouched new record: «Звідки» is the platform holding the most money, its currency follows the
  // platform. A balance only shrinks by withdrawals in the platform's own currency.
  const [platformPick, setPlatformPick] = useState<string | null>(
    w ? (w.platformId ?? NO_PLATFORM) : null
  )
  const [currencyPick, setCurrencyPick] = useState<Currency | null>(w?.currency ?? null)
  const richest = overview?.platformBalances
    .filter((b) => b.balance > 0)
    .sort((a, b) => b.balance - a.balance)[0]?.platformId
  const platformId = platformPick ?? richest ?? NO_PLATFORM
  const currency = currencyPick ?? platformList.find((p) => p.id === platformId)?.currency ?? 'USD'

  const [amount, setAmount] = useState<number | null>(w?.amount ?? null)
  const [amountTouched, setAmountTouched] = useState(false)
  const [fee, setFee] = useState<number | null>(w?.fee ?? 0)
  const [receivedCurrency, setReceivedCurrency] = useState<Currency>(w?.receivedCurrency ?? 'UAH')
  // A new record never starts from a made-up 1: the last real rate of this pair, otherwise empty.
  // Rate 1 between two currencies is the old default, not a rate, so it is skipped.
  const lastRate = history.find(
    (x) =>
      x.currency === currency &&
      x.receivedCurrency === receivedCurrency &&
      x.currency !== x.receivedCurrency &&
      x.rate > 0 &&
      x.rate !== 1
  )?.rate
  const [ratePick, setRate] = useState<number | null | undefined>(w?.rate)
  const rate = ratePick !== undefined ? ratePick : (lastRate ?? null)
  // A stored value equal to the calculation was auto → keep the field empty so edits recalculate it.
  const [received, setReceived] = useState<number | null>(
    w && w.received !== receivedOf(w.amount, w.fee, w.rate) ? w.received : null
  )
  const [method, setMethod] = useState(w?.method ?? '')
  const [at, setAt] = useState<number | null>(w?.at ?? defaultAt)
  const [note, setNote] = useState(w?.note ?? '')
  const create = useApiMutation('finance', 'createWithdrawal', {
    successMessage: 'Виведення додано'
  })
  const update = useApiMutation('finance', 'updateWithdrawal', {
    successMessage: 'Виведення збережено'
  })

  const sameCurrency = currency === receivedCurrency
  const effectiveRate = sameCurrency ? 1 : (rate ?? 0)
  const estimate = receivedOf(amount ?? 0, fee ?? 0, effectiveRate)
  // A rate of 0 / empty was silently saved as 1, a fee above the amount as «received 0»: both are typos.
  const rateBad = !sameCurrency && !(effectiveRate > 0)
  const hasAmount = (amount ?? 0) > 0
  const feeBad = hasAmount && (fee ?? 0) > (amount ?? 0)
  // Red only once there is an amount: an empty rate right after opening is not a mistake yet.
  const rateError =
    hasAmount && rateBad ? (rate === null ? 'Вкажіть курс' : 'Курс має бути більше 0') : undefined
  const payload = {
    platformId: platformId === NO_PLATFORM ? null : platformId,
    amount: amount ?? 0,
    currency,
    fee: fee ?? 0,
    rate: effectiveRate,
    receivedCurrency,
    received,
    method: method.trim(),
    at: at ?? defaultAt,
    note
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={w ? 'Виведення' : 'Нове виведення'}
      description="Скільки виведено з платформи, скільки пішло на комісію і скільки реально надійшло."
      submitLabel={w ? 'Зберегти' : 'Додати виведення'}
      invalid={!(payload.amount > 0) || rateBad || feeBad || fields.invalid}
      pending={create.isPending || update.isPending}
      values={w ? payload : undefined}
      onSubmit={async () => {
        if (w) await update.mutateAsync({ id: w.id, patch: payload })
        else await create.mutateAsync(payload)
        onOpenChange(false)
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Звідки" htmlFor={`${id}-platform`}>
          <Select value={platformId} onValueChange={setPlatformPick}>
            <SelectTrigger id={`${id}-platform`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PLATFORM}>Інше</SelectItem>
              {/* Direct orders hold no balance on a platform; money from elsewhere is «Інше». */}
              {platformList
                .filter((p) => p.kind !== 'direct' || p.id === w?.platformId)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.archived ? `${p.name} (архів)` : p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Дата" htmlFor={`${id}-at`}>
          <DatePicker id={`${id}-at`} value={at} onChange={setAt} clearable={false} />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_1fr_110px] items-start gap-3">
        <NumberField
          id={`${id}-amount`}
          label="Сума"
          autoFocus={!w}
          live
          {...WD_R.amount}
          value={amount}
          onCommit={(v) => {
            setAmount(v)
            setAmountTouched(true)
          }}
          onValidityChange={fields.report('amount')}
          error={amountTouched && !(payload.amount > 0) ? 'Вкажіть суму більше 0' : undefined}
        />
        <NumberField
          id={`${id}-fee`}
          label="Комісія за виведення"
          live
          {...WD_R.fee}
          value={fee}
          onCommit={setFee}
          onValidityChange={fields.report('fee')}
          error={feeBad ? 'Комісія більша за суму виведення' : undefined}
        />
        <Field label="Валюта" htmlFor={`${id}-currency`}>
          <CurrencySelect
            id={`${id}-currency`}
            aria-label="Валюта виведення"
            value={currency}
            onChange={setCurrencyPick}
          />
        </Field>
      </div>
      <div
        className={cn(
          'grid items-start gap-3',
          sameCurrency ? 'grid-cols-[1fr_110px]' : 'grid-cols-[1fr_1fr_110px]'
        )}
      >
        {!sameCurrency && (
          <NumberField
            id={`${id}-rate`}
            label={`Курс: 1 ${currency} =`}
            unit={receivedCurrency}
            live
            {...WD_R.rate}
            // Banks quote four decimals (1 UAH = 0,0241 USD).
            step={0.0001}
            value={rate}
            onCommit={setRate}
            onValidityChange={fields.report('rate')}
            error={rateError}
            hint={
              hasAmount && rate === 1
                ? `Курс 1:1 для ${currency} → ${receivedCurrency} — перевірте`
                : ratePick === undefined && lastRate !== undefined
                  ? 'Як у минулому виведенні'
                  : undefined
            }
          />
        )}
        <NumberField
          id={`${id}-received`}
          label="Фактично надійшло"
          live
          {...WD_R.received}
          value={received}
          onCommit={setReceived}
          onValidityChange={fields.report('received')}
          hint={sameCurrency ? 'Порожнє — сума мінус комісія' : 'Порожнє — порахуємо за курсом'}
        />
        <Field label="Валюта" htmlFor={`${id}-received-currency`}>
          <CurrencySelect
            id={`${id}-received-currency`}
            aria-label="Валюта зарахування"
            value={receivedCurrency}
            onChange={setReceivedCurrency}
          />
        </Field>
      </div>
      {/* Stays in place while empty (the dialog doesn't jump), but no formula of zeros before input. */}
      <div className="rounded-xl bg-surface px-4 py-3 text-body">
        {!hasAmount ? (
          <span className="text-muted-foreground">Вкажіть суму — порахуємо, скільки надійде</span>
        ) : received !== null ? (
          // A typed sum is exact: no «≈» and no formula that wouldn't add up to it.
          <>
            <span className="text-muted-foreground">Надійде </span>
            <span className="font-medium tabular-nums">{fmtMoney(received, receivedCurrency)}</span>
            {!rateBad && (
              <div className="text-caption text-muted-foreground">
                {sameCurrency ? 'за розрахунком було б' : 'за курсом було б'}{' '}
                {fmtMoney(estimate, receivedCurrency)}
              </div>
            )}
          </>
        ) : rateBad ? (
          <span className="text-muted-foreground">Вкажіть курс — порахуємо, скільки надійде</span>
        ) : (
          <>
            <span className="text-muted-foreground">Надійде ≈ </span>
            <span className="font-medium tabular-nums">{fmtMoney(estimate, receivedCurrency)}</span>
            <span className="text-muted-foreground">
              {' '}
              = {sameCurrency ? '' : '('}
              {fmtMoney(amount ?? 0, currency)} − {fmtMoney(fee ?? 0, currency)}
              {sameCurrency ? '' : `) × ${fmtRate(effectiveRate)}`}
            </span>
          </>
        )}
      </div>
      <Field label="Спосіб (необов’язково)" htmlFor={`${id}-method`}>
        <Input
          id={`${id}-method`}
          value={method}
          maxLength={WD_L.method}
          onChange={(e) => setMethod(e.target.value)}
          placeholder="Payoneer, картка, Wise…"
        />
      </Field>
      <Field
        label="Нотатка (необов’язково)"
        htmlFor={`${id}-note`}
        count={{ length: note.length, max: WD_L.note }}
      >
        <Textarea
          id={`${id}-note`}
          value={note}
          maxLength={WD_L.note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-14"
        />
      </Field>
    </FormDialog>
  )
}
