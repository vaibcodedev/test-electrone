import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import {
  CREDIT_KINDS,
  creditTxInputSchema,
  type CreditKind,
  type Platform
} from '@shared/domain/freelance'
import { useApi, useApiMutation } from '@/lib/query'
import { limitsOf, rangesOf } from '@/lib/limits'
import { NumberField } from '@/components/common/number-field'
import { StatTile } from '@/components/common/stat-tile'
import { MoneyValue } from '@/components/common/money-value'
import { fmtDate, fmtMoney, fmtNumber } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { DatePicker } from '@/components/common/date-picker'
import { EmptyState, Field, Segmented } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { EmptyValue } from '../crm/parts'

const NOTE_MAX = limitsOf(creditTxInputSchema).note
const CREDIT_R = rangesOf(creditTxInputSchema)

const KIND_LABEL: Record<CreditKind, string> = {
  purchase: 'Купівля',
  bonus: 'Бонус',
  refund: 'Повернення',
  adjust: 'Коригування'
}

const AMOUNT_ID = 'credit-amount'

/** Bid credits (Connects): balance, cost per contract, purchase ledger. Spending comes from proposals. */
export function CreditsTab({ platform }: { platform: Platform }) {
  const { data: s } = useApi('credits', 'summary', { platformId: platform.id })
  const { data: txs = [] } = useApi('credits', 'list', { platformId: platform.id })
  const add = useApiMutation('credits', 'add')
  const remove = useApiMutation('credits', 'remove')
  const [kind, setKind] = useState<CreditKind>('purchase')
  const [amount, setAmount] = useState<number | null>(null)
  const [cost, setCost] = useState<number | null>(null)
  const [at, setAt] = useState<number | null>(() => Date.now())
  const [note, setNote] = useState('')
  // An out-of-range amount is never committed: block «Додати» instead of adding the previous value.
  const [amountBad, setAmountBad] = useState(false)
  const [costBad, setCostBad] = useState(false)
  const name = platform.creditsName || 'Конекти'
  const amountNum = amount ?? 0
  const costNum = cost ?? (kind === 'purchase' ? amountNum * platform.creditPrice : 0)
  // Why «Додати» is inactive — said under the row instead of a silently disabled button.
  const reason =
    amount === null
      ? 'Вкажіть кількість'
      : kind !== 'adjust' && amountNum <= 0
        ? 'Кількість має бути більше нуля'
        : !at
          ? 'Оберіть дату'
          : null
  const valid = reason === null && !amountBad && !costBad

  const money = (n: number): ReactNode => <MoneyValue amount={n} currency={platform.currency} />

  const submit = (): void => {
    if (!valid || !at || add.isPending) return
    add.mutate(
      {
        platformId: platform.id,
        kind,
        amount: amountNum,
        cost: kind === 'purchase' ? costNum : 0,
        at,
        note: note.trim()
      },
      {
        onSuccess: () => {
          toast.success(`Додано ${amountNum} — ${name}`)
          setAmount(null)
          setCost(null)
          setNote('')
        }
      }
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="stagger grid grid-cols-3 gap-3 xl:grid-cols-6">
        <StatTile tone="ink" label="Баланс" value={s?.balance ?? 0} hint={name} />
        <StatTile
          label="Куплено"
          value={s?.purchased ?? 0}
          hint={s?.moneySpent ? <>за {money(s.moneySpent)}</> : 'купівель ще не було'}
        />
        <StatTile
          label="Витрачено"
          value={s?.spent ?? 0}
          hint="на платні відгуки (разом із бустом)"
        />
        <StatTile
          label="Середня ціна"
          value={
            s?.avgCreditPrice ? money(s.avgCreditPrice) : <EmptyValue>ще немає купівель</EmptyValue>
          }
          hint={s?.avgCreditPrice ? 'за одиницю' : undefined}
        />
        <StatTile
          label="На контракт"
          value={
            s?.creditsPerContract ? s.creditsPerContract : <EmptyValue>ще немає контрактів</EmptyValue>
          }
          hint={s?.creditsPerContract ? 'на 1 контракт' : undefined}
        />
        <StatTile
          label="Ціна контракту"
          value={
            s?.costPerContract ? money(s.costPerContract) : <EmptyValue>ще немає контрактів</EmptyValue>
          }
          hint={s?.costPerContract ? `контрактів: ${s.contracts}` : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Записати поповнення</CardTitle>
          <CardDescription>
            Витрати рахуються автоматично з відгуків — сюди пишіть лише купівлі, бонуси й
            повернення.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <form
            // One baseline: labels above, every control h-9 with the standard field look.
            className="grid grid-cols-[auto_140px_170px_190px_minmax(0,1fr)_auto] items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <Field label="Тип">
              <Segmented
                className="w-fit"
                value={kind}
                onChange={setKind}
                options={CREDIT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              />
            </Field>
            <NumberField
              id={AMOUNT_ID}
              label="Кількість"
              integer
              min={kind === 'adjust' ? CREDIT_R.amount?.min : 1}
              max={CREDIT_R.amount?.max}
              value={amount}
              onCommit={setAmount}
              live
              placeholder="Напр.: 80"
              unit="шт"
              onValidityChange={setAmountBad}
            />
            {/* Empty means «price × amount» (the placeholder shows it); only purchases cost money. */}
            <NumberField
              label="Вартість"
              unit={platform.currency}
              min={CREDIT_R.cost?.min}
              max={CREDIT_R.cost?.max}
              step={0.01}
              disabled={kind !== 'purchase'}
              value={kind === 'purchase' ? cost : null}
              onCommit={setCost}
              onValidityChange={setCostBad}
              placeholder={
                kind === 'purchase' && amountNum > 0
                  ? `≈ ${fmtNumber(amountNum * platform.creditPrice)}`
                  : '0'
              }
            />
            <Field label="Дата">
              <DatePicker value={at} onChange={setAt} clearable={false} />
            </Field>
            <Field label="Коментар">
              <Input
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Необов’язково"
              />
            </Field>
            <Button type="submit" disabled={!valid || add.isPending}>
              <Plus /> Додати
            </Button>
          </form>
          {/* An out-of-range amount already says so under the field. */}
          {reason && amount !== null && !amountBad && (
            <p className="text-caption text-warn">{reason}</p>
          )}
          {reason && amount === null && (
            <p className="text-caption text-muted-foreground">{reason}, щоб додати запис.</p>
          )}
        </CardContent>
      </Card>

      {txs.length === 0 ? (
        <EmptyState
          illustration="3d-coin"
          title="Поповнень поки немає"
          hint="Запишіть першу купівлю, щоб бачити ціну одного контракту."
          cta={{
            label: 'Записати купівлю',
            icon: Plus,
            onClick: () => document.getElementById(AMOUNT_ID)?.focus()
          }}
        />
      ) : (
        <Card className="py-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Дата</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead className="text-right">Кількість</TableHead>
                <TableHead className="text-right">Вартість</TableHead>
                <TableHead>Коментар</TableHead>
                <TableHead className="w-12 pr-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((t) => (
                <TableRow key={t.id} className="group">
                  <TableCell className="pl-5 tabular-nums">{fmtDate(t.at)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        t.kind === 'purchase' ? 'soft' : t.kind === 'bonus' ? 'success' : 'outline'
                      }
                    >
                      {KIND_LABEL[t.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {t.amount > 0 ? `+${t.amount}` : t.amount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.cost ? (
                      fmtMoney(t.cost, platform.currency)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-muted-foreground">
                    {t.note || '—'}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Confirm
                      title="Видалити запис?"
                      description="Баланс перерахується. Відновити не можна."
                      onConfirm={() => remove.mutate(t.id)}
                    >
                      <IconAction
                        label="Видалити запис"
                        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                      >
                        <Trash2 />
                      </IconAction>
                    </Confirm>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
