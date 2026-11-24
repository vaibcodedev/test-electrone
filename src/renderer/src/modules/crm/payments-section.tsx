import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  CURRENCIES,
  PAYMENT_STATUSES,
  type Currency,
  type Payment,
  type PaymentStatus
} from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { fmtDate, fmtMoney, fromLocalInput } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/common/page'
import { cn } from '@/lib/utils'
import { PAYMENT_STATUS_LABEL } from './labels'
import { Choice, Section, numberOrZero } from './parts'

const STATUS_STYLE: Record<PaymentStatus, string> = {
  expected: 'bg-card',
  invoiced: 'bg-info/15 text-info',
  paid: 'bg-lime text-lime-foreground',
  cancelled: 'bg-card text-muted-foreground line-through'
}

function PaymentForm({ projectId, currency, onDone }: { projectId: string; currency: Currency; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState<Currency>(currency)
  const [status, setStatus] = useState<PaymentStatus>('expected')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  const create = useApiMutation('payments', 'create', { successMessage: 'Оплата добавлена', onSuccess: onDone })
  const value = numberOrZero(amount)
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (value > 0) create.mutate({ projectId, amount: value, currency: cur, status, dueAt: fromLocalInput(due), note })
      }}
    >
      <Field label="Сумма">
        <Input autoFocus inputMode="decimal" className="w-28 bg-card" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
      </Field>
      <Field label="Валюта">
        <Choice className="w-24 bg-card" value={cur} onChange={(v) => v && setCur(v)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      </Field>
      <Field label="Статус">
        <Choice
          className="w-40 bg-card"
          value={status}
          onChange={(v) => v && setStatus(v)}
          options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))}
        />
      </Field>
      <Field label="Срок">
        <Input type="date" className="w-36 bg-card" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <Field label="Комментарий" className="min-w-40 flex-1">
        <Input className="bg-card" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Предоплата 50%" />
      </Field>
      <Button type="button" variant="ghost" onClick={onDone}>
        Отмена
      </Button>
      <Button type="submit" variant="lime" disabled={value <= 0}>
        Добавить
      </Button>
    </form>
  )
}

function PaymentRow({ payment }: { payment: Payment }) {
  const update = useApiMutation('payments', 'update')
  const remove = useApiMutation('payments', 'remove')
  return (
    <div
      className={cn(
        'group flex items-center gap-4 rounded-2xl bg-surface px-4 py-3',
        payment.overdue && 'ring-1 ring-destructive/50'
      )}
    >
      <span className="font-display w-36 shrink-0 text-[20px] tabular-nums">{fmtMoney(payment.amount, payment.currency)}</span>
      <div className="min-w-0 flex-1 text-[12.5px]">
        <div className="truncate">{payment.note || <span className="text-muted-foreground">Без комментария</span>}</div>
        <div className={cn('text-[12px]', payment.overdue ? 'text-destructive' : 'text-muted-foreground')}>
          {payment.status === 'paid' && payment.paidAt
            ? `оплачено ${fmtDate(payment.paidAt)}`
            : payment.dueAt
              ? `${payment.overdue ? 'просрочено, срок был ' : 'срок '}${fmtDate(payment.dueAt)}`
              : 'без срока'}
        </div>
      </div>
      <div className="flex gap-1">
        {PAYMENT_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => s !== payment.status && update.mutate({ id: payment.id, patch: { status: s } })}
            className={cn(
              'h-7 rounded-full px-2.5 text-[11.5px] transition-colors',
              s === payment.status ? STATUS_STYLE[s] + ' font-medium' : 'text-muted-foreground hover:bg-card hover:text-foreground'
            )}
          >
            {PAYMENT_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <Button variant="ghost" size="icon-xs" title="Удалить" className="opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(payment.id)}>
        <Trash2 />
      </Button>
    </div>
  )
}

export function PaymentsSection({ projectId, currency, payments }: { projectId: string; currency: Currency; payments: Payment[] }) {
  const [adding, setAdding] = useState(false)
  return (
    <Section
      title="Оплаты"
      action={
        !adding && (
          <Button variant="soft" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Оплата
          </Button>
        )
      }
    >
      {adding && <PaymentForm projectId={projectId} currency={currency} onDone={() => setAdding(false)} />}
      {payments.map((p) => (
        <PaymentRow key={p.id} payment={p} />
      ))}
      {!payments.length && !adding && (
        <p className="text-[13px] text-muted-foreground">Добавьте ожидаемые платежи со сроком — просрочки появятся на главной и в календаре.</p>
      )}
    </Section>
  )
}
