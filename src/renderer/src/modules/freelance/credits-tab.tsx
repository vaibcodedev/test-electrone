import { useRef, useState } from 'react'
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
import { cn } from '@/lib/utils'
import { NumberInput } from '@/components/common/number-input'
import { fmtDate, fmtMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupText } from '@/components/ui/input-group'
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

const NOTE_MAX = limitsOf(creditTxInputSchema).note
const CREDIT_R = rangesOf(creditTxInputSchema)
/** NumberInput inside an InputGroup: the group draws the field, the input stays borderless. */
const GROUP_CONTROL =
  'flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent'

const KIND_LABEL: Record<CreditKind, string> = {
  purchase: 'Купівля',
  bonus: 'Бонус',
  refund: 'Повернення',
  adjust: 'Коригування'
}

function Stat({
  label,
  value,
  hint,
  accent
}: {
  label: string
  /** A number, or a short phrase when there's nothing to count yet («ще немає контрактів»). */
  value: string
  hint?: string
  accent?: boolean
}) {
  const phrase = /[^\d\s.,$€₴£zł+−-]/.test(value) && !/^\d/.test(value)
  return (
    <Card className={accent ? 'bg-ink text-ink-foreground' : undefined}>
      <CardHeader>
        <CardTitle className={accent ? 'text-ink-muted' : undefined}>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            'tabular-nums',
            phrase ? 'text-body text-muted-foreground' : 'font-display text-stat leading-none'
          )}
        >
          {value}
        </div>
        {hint && (
          <div
            className={cn(
              'mt-1.5 text-caption',
              accent ? 'text-ink-muted' : 'text-muted-foreground'
            )}
          >
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Bid credits (Connects): balance, cost per contract, purchase ledger. Spending comes from proposals. */
export function CreditsTab({ platform }: { platform: Platform }) {
  const { data: s } = useApi('credits', 'summary', { platformId: platform.id })
  const { data: txs = [] } = useApi('credits', 'list', { platformId: platform.id })
  const add = useApiMutation('credits', 'add')
  const remove = useApiMutation('credits', 'remove')
  const amountRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<CreditKind>('purchase')
  const [amount, setAmount] = useState<number | null>(null)
  const [cost, setCost] = useState<number | null>(null)
  const [at, setAt] = useState<number | null>(() => Date.now())
  const [note, setNote] = useState('')
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
  const valid = reason === null

  const money = (n: number | null | undefined): string | null =>
    n === null || n === undefined ? null : fmtMoney(n, platform.currency)

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
          toast.success(`Додано ${amountNum} ${name.toLowerCase()}`)
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
        <Stat accent label="Баланс" value={String(s?.balance ?? 0)} hint={name} />
        <Stat
          label="Куплено"
          value={String(s?.purchased ?? 0)}
          hint={s?.moneySpent ? `за ${money(s.moneySpent)}` : 'купівель ще не було'}
        />
        <Stat label="Витрачено" value={String(s?.spent ?? 0)} hint="на відгуки з бустом" />
        <Stat
          label="Середня ціна"
          value={s?.avgCreditPrice ? (money(s.avgCreditPrice) ?? '') : 'ще немає купівель'}
          hint={s?.avgCreditPrice ? 'за одиницю' : undefined}
        />
        <Stat
          label="На контракт"
          value={s?.creditsPerContract ? String(s.creditsPerContract) : 'ще немає контрактів'}
          hint={s?.creditsPerContract ? `${name.toLowerCase()} на 1 контракт` : undefined}
        />
        <Stat
          label="Ціна контракту"
          value={s?.costPerContract ? (money(s.costPerContract) ?? '') : 'ще немає контрактів'}
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
            // One baseline: labels above, every control h-9 on bg-card (the card itself is surface).
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
            <Field label="Кількість">
              <InputGroup className="bg-card">
                <NumberInput
                  ref={amountRef}
                  data-slot="input-group-control"
                  className={GROUP_CONTROL}
                  integer
                  allowEmpty
                  min={kind === 'adjust' ? CREDIT_R.amount?.min : 1}
                  max={CREDIT_R.amount?.max}
                  value={amount}
                  onChange={setAmount}
                  placeholder="напр. 80"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>шт</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <Field label="Вартість">
              <InputGroup className="bg-card">
                <NumberInput
                  data-slot="input-group-control"
                  className={GROUP_CONTROL}
                  allowEmpty
                  {...CREDIT_R.cost}
                  step={0.01}
                  disabled={kind !== 'purchase'}
                  value={kind === 'purchase' ? cost : null}
                  onChange={setCost}
                  placeholder={
                    kind === 'purchase' && amountNum > 0
                      ? `≈ ${(amountNum * platform.creditPrice).toFixed(2)}`
                      : '0'
                  }
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{platform.currency}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <Field label="Дата">
              <DatePicker
                value={at}
                onChange={setAt}
                clearable={false}
                className="[&_button]:bg-card"
              />
            </Field>
            <Field label="Коментар">
              <Input
                className="bg-card"
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
          {reason && amount !== null && <p className="text-caption text-warn">{reason}</p>}
          {reason && amount === null && (
            <p className="text-caption text-muted-foreground">{reason}, щоб додати запис.</p>
          )}
        </CardContent>
      </Card>

      {txs.length === 0 ? (
        <EmptyState
          title="Поповнень поки немає"
          hint={`Запишіть першу купівлю ${name}, щоб бачити ціну одного контракту.`}
          action={
            <Button variant="subtle" onClick={() => amountRef.current?.focus()}>
              <Plus /> Записати купівлю
            </Button>
          }
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
                    {t.cost ? money(t.cost) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-muted-foreground">
                    {t.note || '—'}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Confirm
                      title="Видалити запис?"
                      description="Баланс перерахується."
                      onConfirm={() => remove.mutate(t.id)}
                    >
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Видалити запис"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
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
