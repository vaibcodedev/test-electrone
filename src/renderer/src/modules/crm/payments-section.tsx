import { useState, type ReactElement } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  CURRENCIES,
  PAYMENT_STATUSES,
  paymentInputSchema,
  type BillingType,
  type Currency,
  type Payment,
  type PaymentStatus
} from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { limitsOf, rangesOf } from '@/lib/limits'
import { fmtDay, fmtMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Field } from '@/components/common/page'
import { DatePicker } from '@/components/common/date-picker'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { NumberField } from '@/components/common/number-field'
import { useDetailMode } from '@/components/common/detail-mode-context'
import { cn } from '@/lib/utils'
import { CURRENCY_SIGN, PAYMENT_STATUS_LABEL } from './labels'
import { Choice, Section } from './parts'
import { escapeCloses } from './inline-form'

const NOTE_MAX = limitsOf(paymentInputSchema).note
const AMOUNT_MAX = rangesOf(paymentInputSchema).amount?.max

const STATUS_TONE: Record<PaymentStatus, string> = {
  expected: '',
  invoiced: 'text-info',
  paid: 'text-success',
  cancelled: 'text-muted-foreground line-through'
}

function PaymentForm({
  projectId,
  currency,
  stage,
  remaining,
  initial,
  onDone
}: {
  projectId: string
  currency: Currency
  stage: boolean
  /** Unallocated part of a fixed price (stages only); the amount can't exceed it in the project currency. */
  remaining?: number
  /** Editing an existing payment instead of adding one. */
  initial?: Payment
  onDone: () => void
}): ReactElement {
  // A new first stage starts with what is left to allocate.
  const [amount, setAmount] = useState<number | null>(
    () => initial?.amount ?? (stage && remaining ? remaining : null)
  )
  const [cur, setCur] = useState<Currency>(initial?.currency ?? currency)
  const [status, setStatus] = useState<PaymentStatus>(initial?.status ?? 'expected')
  const [due, setDue] = useState<number | null>(initial?.dueAt ?? null)
  const [note, setNote] = useState(initial?.note ?? '')
  const what = stage ? 'Етап' : 'Оплату'
  const create = useApiMutation('payments', 'create', {
    successMessage: `${what} додано`,
    onSuccess: onDone
  })
  const update = useApiMutation('payments', 'update', {
    successMessage: `${what} оновлено`,
    onSuccess: onDone
  })
  const pending = create.isPending || update.isPending
  // The payment being edited frees its own amount.
  const left =
    remaining === undefined
      ? undefined
      : remaining + (initial && initial.currency === currency && initial.status !== 'cancelled' ? initial.amount : 0)
  const limited = stage && left !== undefined && cur === currency
  const ready = !!amount && amount > 0 && !pending
  return (
    <Card className="p-4">
      <form
        className="grid grid-cols-[minmax(180px,220px)_100px_170px_1fr] items-start gap-3"
        onKeyDown={escapeCloses(onDone)}
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready || !amount) return
          const values = { amount, currency: cur, status, dueAt: due, note }
          if (initial) update.mutate({ id: initial.id, patch: values })
          else create.mutate({ projectId, ...values })
        }}
      >
        <NumberField
          label="Сума"
          value={amount}
          min={0}
          max={limited ? left : AMOUNT_MAX}
          unit={CURRENCY_SIGN[cur]}
          placeholder="500"
          hint={limited ? `Можна розподілити ще ${fmtMoney(left ?? 0, currency)}` : 'Вкажіть суму'}
          onCommit={setAmount}
        />
        <Field label="Валюта">
          <Choice
            value={cur}
            onChange={(v) => v && setCur(v)}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="Статус">
          <Choice
            value={status}
            onChange={(v) => v && setStatus(v)}
            options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))}
          />
        </Field>
        <Field label="Термін">
          <DatePicker value={due} onChange={setDue} placeholder="Без терміну" />
        </Field>
        <Field label={stage ? 'Етап' : 'Коментар'} className="col-span-4">
          <Input
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder={stage ? 'Передоплата 50% / Дизайн / Запуск' : 'За листопад'}
          />
        </Field>
        <div className="col-span-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Скасувати
          </Button>
          <Button type="submit" variant="lime" disabled={!ready}>
            {initial ? 'Зберегти' : 'Додати'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PaymentRow({
  payment,
  stage,
  currency,
  remaining
}: {
  payment: Payment
  stage: boolean
  currency: Currency
  remaining?: number
}): ReactElement {
  const [editing, setEditing] = useState(false)
  const update = useApiMutation('payments', 'update')
  const remove = useApiMutation('payments', 'remove')
  if (editing)
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={5} className="whitespace-normal">
          <PaymentForm
            projectId={payment.projectId}
            currency={currency}
            stage={stage}
            remaining={remaining}
            initial={payment}
            onDone={() => setEditing(false)}
          />
        </TableCell>
      </TableRow>
    )
  const what = stage ? 'етап' : 'оплату'
  return (
    <TableRow className={cn('group', payment.overdue && 'bg-destructive/5')}>
      <TableCell className="font-display text-heading tabular-nums">
        {fmtMoney(payment.amount, payment.currency)}
      </TableCell>
      <TableCell className="max-w-0 truncate" title={payment.note || undefined}>
        {payment.note}
      </TableCell>
      <TableCell
        className={cn(
          'text-caption',
          payment.overdue ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {payment.status === 'paid' && payment.paidAt
          ? `оплачено ${fmtDay(payment.paidAt)}`
          : payment.dueAt
            ? `${payment.overdue ? 'прострочено, термін ' : 'до '}${fmtDay(payment.dueAt)}`
            : 'без терміну'}
      </TableCell>
      <TableCell className="w-[170px]">
        <Choice
          size="sm"
          className={cn(
            'border-transparent bg-transparent shadow-none hover:bg-card dark:bg-transparent',
            STATUS_TONE[payment.status]
          )}
          value={payment.status}
          onChange={(s) =>
            s && s !== payment.status && update.mutate({ id: payment.id, patch: { status: s } })
          }
          options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))}
        />
      </TableCell>
      <TableCell className="w-16">
        <span
          data-edit-only
          className="flex justify-end opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <IconAction label={stage ? 'Змінити етап' : 'Змінити оплату'} onClick={() => setEditing(true)}>
            <Pencil />
          </IconAction>
          <Confirm
            title={`Видалити ${what} ${fmtMoney(payment.amount, payment.currency)}?`}
            description="Відновити не можна."
            onConfirm={() => remove.mutate(payment.id)}
          >
            <IconAction label={`Видалити ${what}`} className="hover:text-destructive">
              <Trash2 />
            </IconAction>
          </Confirm>
        </span>
      </TableCell>
    </TableRow>
  )
}

/** Payments; for fixed-price projects they are payment stages measured against the price. */
export function PaymentsSection({
  projectId,
  currency,
  payments,
  billing,
  price
}: {
  projectId: string
  currency: Currency
  payments: Payment[]
  billing: BillingType
  price: number
}): ReactElement {
  const mode = useDetailMode()
  const [adding, setAdding] = useState(false)
  const stages = billing === 'fixed'
  const planned = payments
    .filter((p) => p.status !== 'cancelled')
    .reduce((s, p) => s + (p.currency === currency ? p.amount : 0), 0)
  const remaining = stages && price > 0 ? Math.max(0, price - planned) : undefined
  const add = stages ? 'Додати етап' : 'Додати оплату'
  return (
    <Section
      title={stages ? 'Етапи оплати' : 'Оплати'}
      hint={
        stages && price > 0
          ? planned < price
            ? `Не розподілено ${fmtMoney(price - planned, currency)}`
            : 'Усю вартість розподілено на етапи'
          : billing === 'retainer'
            ? 'Платежі за місяцями ретейнера'
            : undefined
      }
      action={
        !adding && (
          <Button variant="soft" size="sm" data-edit-only onClick={() => setAdding(true)}>
            <Plus /> {stages ? 'Етап' : 'Оплата'}
          </Button>
        )
      }
    >
      {stages && price > 0 && planned > price && (
        <p className="text-caption text-warn">
          Етапи на {fmtMoney(planned - price, currency)} більші за вартість проєкту — змініть
          вартість або етап.
        </p>
      )}
      {adding && (
        <PaymentForm
          projectId={projectId}
          currency={currency}
          stage={stages}
          remaining={remaining}
          onDone={() => setAdding(false)}
        />
      )}
      {payments.length > 0 && (
        <Card className="py-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Сума</TableHead>
                <TableHead>{stages ? 'Етап' : 'Коментар'}</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody className="[&_td:first-child]:pl-5">
              {payments.map((p) => (
                <PaymentRow
                  key={p.id}
                  payment={p}
                  stage={stages}
                  currency={currency}
                  remaining={remaining}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {!payments.length && !adding && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body leading-relaxed text-muted-foreground">
            {stages
              ? 'Етапів ще немає. Розбийте вартість на етапи з термінами — прострочки з’являться на головній і в календарі.'
              : 'Оплат ще немає. Додайте очікувані платежі з терміном — прострочки з’являться на головній і в календарі.'}
          </p>
          {!mode.editing && (
            <Button
              variant="soft"
              size="sm"
              onClick={() => {
                mode.setEditing(true)
                setAdding(true)
              }}
            >
              <Plus /> {add}
            </Button>
          )}
        </div>
      )}
    </Section>
  )
}
