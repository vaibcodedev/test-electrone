import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { CREDIT_KINDS, type CreditKind, type Platform } from '@shared/domain/freelance'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDate, fmtMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePicker } from '@/components/common/date-picker'
import { EmptyState, Field, Segmented } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'

const KIND_LABEL: Record<CreditKind, string> = {
  purchase: 'Покупка',
  bonus: 'Бонус',
  refund: 'Возврат',
  adjust: 'Корректировка'
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <Card className={accent ? 'bg-ink text-ink-foreground' : undefined}>
      <CardHeader>
        <CardTitle className={accent ? 'text-ink-muted' : undefined}>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-display text-[30px] leading-none tabular-nums">{value}</div>
        {hint && <div className={accent ? 'mt-1.5 text-[12px] text-ink-muted' : 'mt-1.5 text-[12px] text-muted-foreground'}>{hint}</div>}
      </CardContent>
    </Card>
  )
}

/** Bid credits (Connects): balance, cost per contract, purchase ledger. Spending comes from proposals. */
export function CreditsTab({ platform }: { platform: Platform }) {
  const { data: s } = useApi('credits', 'summary', { platformId: platform.id })
  const { data: txs = [] } = useApi('credits', 'list', { platformId: platform.id })
  const add = useApiMutation('credits', 'add', { successMessage: 'Записано' })
  const remove = useApiMutation('credits', 'remove')
  const [kind, setKind] = useState<CreditKind>('purchase')
  const [amount, setAmount] = useState('')
  const [cost, setCost] = useState('')
  const [at, setAt] = useState<number | null>(() => Date.now())
  const [note, setNote] = useState('')
  const name = platform.creditsName || 'Ставки'
  const amountNum = Math.round(Number(amount))
  const costNum = cost.trim() ? Number(cost.replace(',', '.')) : kind === 'purchase' ? amountNum * platform.creditPrice : 0
  const valid = amount.trim() !== '' && !Number.isNaN(amountNum) && (kind === 'adjust' || amountNum > 0) && !Number.isNaN(costNum) && !!at

  const money = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : fmtMoney(n, platform.currency))

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
        <Stat accent label="Баланс" value={String(s?.balance ?? 0)} hint={name} />
        <Stat label="Куплено" value={String(s?.purchased ?? 0)} hint={`за ${money(s?.moneySpent)}`} />
        <Stat label="Потрачено" value={String(s?.spent ?? 0)} hint="на отклики с бустом" />
        <Stat label="Средняя цена" value={s?.avgCreditPrice ? money(s.avgCreditPrice) : '—'} hint="за единицу" />
        <Stat label="На контракт" value={s?.creditsPerContract ? String(s.creditsPerContract) : '—'} hint={`${name.toLowerCase()} на 1 контракт`} />
        <Stat label="Цена контракта" value={money(s?.costPerContract)} hint={`контрактов: ${s?.contracts ?? 0}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Записать пополнение</CardTitle>
          <CardDescription>Траты считаются автоматически из откликов — сюда пишите только покупки, бонусы и возвраты.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid grid-cols-[auto_120px_160px_200px_1fr_auto] items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!valid || !at) return
              add.mutate(
                { platformId: platform.id, kind, amount: amountNum, cost: kind === 'purchase' ? costNum : 0, at, note: note.trim() },
                {
                  onSuccess: () => {
                    setAmount('')
                    setCost('')
                    setNote('')
                  }
                }
              )
            }}
          >
            <Field label="Тип">
              <Segmented value={kind} onChange={setKind} options={CREDIT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
            </Field>
            <Field label="Количество">
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="80" />
            </Field>
            <Field label="Стоимость">
              <InputGroup>
                <InputGroupInput
                  type="number"
                  min={0}
                  step={0.01}
                  disabled={kind !== 'purchase'}
                  value={kind === 'purchase' ? cost : ''}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder={kind === 'purchase' && amountNum > 0 ? (amountNum * platform.creditPrice).toFixed(2) : '0'}
                />
                <InputGroupAddon align="inline-end">{platform.currency}</InputGroupAddon>
              </InputGroup>
            </Field>
            <Field label="Дата">
              <DatePicker value={at} onChange={setAt} clearable={false} />
            </Field>
            <Field label="Комментарий">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Необязательно" />
            </Field>
            <Button type="submit" variant="lime" disabled={!valid || add.isPending}>
              <Plus /> Добавить
            </Button>
          </form>
        </CardContent>
      </Card>

      {txs.length === 0 ? (
        <EmptyState title="Пополнений пока нет" hint={`Запишите первую покупку ${name}, чтобы видеть цену одного контракта.`} />
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Дата</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead className="text-right">Количество</TableHead>
                <TableHead className="text-right">Стоимость</TableHead>
                <TableHead>Комментарий</TableHead>
                <TableHead className="w-12 pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.map((t) => (
                <TableRow key={t.id} className="group">
                  <TableCell className="pl-4 tabular-nums">{fmtDate(t.at)}</TableCell>
                  <TableCell>
                    <Badge variant={t.kind === 'purchase' ? 'soft' : t.kind === 'bonus' ? 'lime' : 'outline'}>{KIND_LABEL[t.kind]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.amount > 0 ? `+${t.amount}` : t.amount}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.cost ? money(t.cost) : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{t.note || '—'}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <Confirm title="Удалить запись?" description="Баланс пересчитается." onConfirm={() => remove.mutate(t.id)}>
                      <Button variant="ghost" size="icon-xs" aria-label="Удалить запись" className="opacity-0 group-hover:opacity-100 hover:text-destructive">
                        <Trash2 />
                      </Button>
                    </Confirm>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
