import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  CURRENCIES,
  PAYMENT_STATUSES,
  type BillingType,
  type Currency,
  type Payment,
  type PaymentStatus
} from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { fmtDate, fmtMoney } from '@/lib/format'
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
import { cn } from '@/lib/utils'
import { PAYMENT_STATUS_LABEL } from './labels'
import { Choice, Meter, Section } from './parts'
import { numberOrZero } from './money'

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
  onDone
}: {
  projectId: string
  currency: Currency
  stage: boolean
  onDone: () => void
}) {
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState<Currency>(currency)
  const [status, setStatus] = useState<PaymentStatus>('expected')
  const [due, setDue] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const create = useApiMutation('payments', 'create', {
    successMessage: stage ? 'Этап добавлен' : 'Оплата добавлена',
    onSuccess: onDone
  })
  const value = numberOrZero(amount)
  return (
    <Card className="p-4">
      <form
        className="grid grid-cols-[120px_100px_170px_1fr] items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (value > 0)
            create.mutate({ projectId, amount: value, currency: cur, status, dueAt: due, note })
        }}
      >
        <Field label="Сумма">
          <Input
            autoFocus
            inputMode="decimal"
            className="bg-card"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500"
          />
        </Field>
        <Field label="Валюта">
          <Choice
            className="bg-card"
            value={cur}
            onChange={(v) => v && setCur(v)}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="Статус">
          <Choice
            className="bg-card"
            value={status}
            onChange={(v) => v && setStatus(v)}
            options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))}
          />
        </Field>
        <Field label="Срок">
          <DatePicker value={due} onChange={setDue} placeholder="Без срока" />
        </Field>
        <Field label={stage ? 'Этап' : 'Комментарий'} className="col-span-3">
          <Input
            className="bg-card"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={stage ? 'Предоплата 50% / Дизайн / Запуск' : 'За ноябрь'}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Отмена
          </Button>
          <Button type="submit" variant="lime" disabled={value <= 0}>
            Добавить
          </Button>
        </div>
      </form>
    </Card>
  )
}

function PaymentRow({ payment }: { payment: Payment }) {
  const update = useApiMutation('payments', 'update')
  const remove = useApiMutation('payments', 'remove')
  return (
    <TableRow className={cn('group', payment.overdue && 'bg-destructive/5')}>
      <TableCell className="font-display text-[18px] tabular-nums">
        {fmtMoney(payment.amount, payment.currency)}
      </TableCell>
      <TableCell className="max-w-0 truncate">
        {payment.note || <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell
        className={cn(
          'text-caption',
          payment.overdue ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {payment.status === 'paid' && payment.paidAt
          ? `оплачено ${fmtDate(payment.paidAt)}`
          : payment.dueAt
            ? `${payment.overdue ? 'просрочено, срок ' : 'до '}${fmtDate(payment.dueAt)}`
            : 'без срока'}
      </TableCell>
      <TableCell className="w-[170px]">
        <Choice
          size="sm"
          className={cn('bg-transparent hover:bg-card', STATUS_TONE[payment.status])}
          value={payment.status}
          onChange={(s) =>
            s && s !== payment.status && update.mutate({ id: payment.id, patch: { status: s } })
          }
          options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))}
        />
      </TableCell>
      <TableCell className="w-10">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Удалить"
          className="opacity-0 group-hover:opacity-100 hover:text-destructive"
          onClick={() => remove.mutate(payment.id)}
        >
          <Trash2 />
        </Button>
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
  price,
  paid
}: {
  projectId: string
  currency: Currency
  payments: Payment[]
  billing: BillingType
  price: number
  paid: number
}) {
  const [adding, setAdding] = useState(false)
  const stages = billing === 'fixed'
  const planned = payments
    .filter((p) => p.status !== 'cancelled')
    .reduce((s, p) => s + (p.currency === currency ? p.amount : 0), 0)
  return (
    <Section
      title={stages ? 'Этапы оплаты' : 'Оплаты'}
      hint={
        stages && price > 0
          ? `Оплачено ${fmtMoney(paid, currency)} из ${fmtMoney(price, currency)}${planned < price ? ` · не распределено ${fmtMoney(price - planned, currency)}` : ''}`
          : billing === 'retainer'
            ? 'Платежи по месяцам абонемента'
            : undefined
      }
      action={
        !adding && (
          <Button variant="soft" size="sm" onClick={() => setAdding(true)}>
            <Plus /> {stages ? 'Этап' : 'Оплата'}
          </Button>
        )
      }
    >
      {stages && price > 0 && <Meter value={paid} max={price} />}
      {adding && (
        <PaymentForm
          projectId={projectId}
          currency={currency}
          stage={stages}
          onDone={() => setAdding(false)}
        />
      )}
      {payments.length > 0 && (
        <Card className="py-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Сумма</TableHead>
                <TableHead>{stages ? 'Этап' : 'Комментарий'}</TableHead>
                <TableHead>Срок</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody className="[&_td:first-child]:pl-5">
              {payments.map((p) => (
                <PaymentRow key={p.id} payment={p} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {!payments.length && !adding && (
        <p className="text-body text-muted-foreground">
          {stages
            ? 'Разбейте стоимость на этапы со сроками — просрочки появятся на главной и в календаре.'
            : 'Добавьте ожидаемые платежи со сроком — просрочки появятся на главной и в календаре.'}
        </p>
      )}
    </Section>
  )
}
