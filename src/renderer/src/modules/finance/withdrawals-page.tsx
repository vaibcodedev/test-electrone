import { useState } from 'react'
import { ArrowDownToLine, Pencil, Plus, Trash2 } from 'lucide-react'
import type { MoneyByCurrency, Withdrawal } from '@shared/domain/finance'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDate, fmtMoney } from '@/lib/format'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FinanceNav, MoneyLines, MonthSwitcher, StatTile } from './parts'
import { WithdrawalDialog } from './dialogs'
import { monthRange, useMonth } from './month'

export function WithdrawalsPage() {
  const [month, setMonth] = useMonth()
  const [from, to] = monthRange(month)
  const { data: rows } = useApi('finance', 'withdrawals', { from, to })
  const { data: platformList = [] } = useApi('platforms', 'list', { includeArchived: true })
  const remove = useApiMutation('finance', 'removeWithdrawal', { successMessage: 'Вывод удалён' })
  const [editing, setEditing] = useState<Withdrawal | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nowTs] = useState(() => Date.now())
  const defaultAt = nowTs >= from && nowTs <= to ? nowTs : from + 12 * 3600_000
  const platformName = new Map(platformList.map((p) => [p.id, p.name]))

  const totals = {
    amount: {} as MoneyByCurrency,
    fee: {} as MoneyByCurrency,
    received: {} as MoneyByCurrency
  }
  for (const w of rows ?? []) {
    totals.amount[w.currency] = (totals.amount[w.currency] ?? 0) + w.amount
    totals.fee[w.currency] = (totals.fee[w.currency] ?? 0) + w.fee
    totals.received[w.receivedCurrency] = (totals.received[w.receivedCurrency] ?? 0) + w.received
  }
  const openDialog = (w: Withdrawal | null): void => {
    setEditing(w)
    setDialogOpen(true)
  }

  return (
    <Page>
      <PageHeader
        title="Выводы"
        subtitle="Деньги, выведенные с платформ: комиссия за вывод, курс и сколько реально пришло на карту."
        actions={
          <>
            <MonthSwitcher month={month} onChange={setMonth} />
            <Button variant="lime" onClick={() => openDialog(null)}>
              <Plus /> Вывод
            </Button>
          </>
        }
      >
        <FinanceNav />
      </PageHeader>
      <PageBody>
        {!rows ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ArrowDownToLine}
            title="В этом месяце выводов нет"
            hint="Запишите вывод, чтобы видеть, сколько денег ещё лежит на платформе и сколько съели комиссии и курс."
            action={
              <Button variant="soft" onClick={() => openDialog(null)}>
                <Plus /> Добавить вывод
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <StatTile title="Выведено" value={totals.amount} />
              <StatTile title="Комиссии за вывод" value={totals.fee} />
              <StatTile ink title="Пришло" value={totals.received} hint="после комиссии и обмена" />
            </div>
            <Card className="py-2">
              <CardContent className="px-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Откуда</TableHead>
                      <TableHead className="text-right">Сумма</TableHead>
                      <TableHead className="text-right">Комиссия</TableHead>
                      <TableHead className="text-right">Курс</TableHead>
                      <TableHead className="text-right">Пришло</TableHead>
                      <TableHead>Способ</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {fmtDate(w.at, 'd MMM')}
                        </TableCell>
                        <TableCell>
                          {w.platformId ? (
                            <Badge variant="soft">
                              {platformName.get(w.platformId) ?? 'Платформа'}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Другое</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtMoney(w.amount, w.currency)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {w.fee ? fmtMoney(w.fee, w.currency) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {w.rate === 1 ? '—' : w.rate}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {fmtMoney(w.received, w.receivedCurrency)}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-muted-foreground">
                          {w.method || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label="Изменить"
                                  onClick={() => openDialog(w)}
                                >
                                  <Pencil />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Изменить</TooltipContent>
                            </Tooltip>
                            <Confirm
                              title="Удалить вывод?"
                              description="Запись будет удалена без возможности восстановления."
                              onConfirm={() => remove.mutate(w.id)}
                            >
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Удалить вывод"
                                className="hover:text-destructive"
                              >
                                <Trash2 />
                              </Button>
                            </Confirm>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2}>Итого</TableCell>
                      <TableCell className="text-right">
                        <MoneyLines value={totals.amount} className="items-end" />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        <MoneyLines value={totals.fee} className="items-end" />
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-right font-semibold">
                        <MoneyLines value={totals.received} className="items-end" />
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>
      <WithdrawalDialog
        key={editing?.id ?? `new-${month}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        withdrawal={editing}
        defaultAt={defaultAt}
      />
    </Page>
  )
}
