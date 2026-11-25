import type { ReactElement } from 'react'
import { ArrowDownToLine, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Withdrawal } from '@shared/domain/finance'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
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
import { IconAction } from '@/components/common/icon-action'
import { FinanceNav, MoneyLines, MonthSwitcher, MoneyStatTile } from './parts'
import { WithdrawalDialog } from './withdrawal-dialog'
import { fmtRate, sumByCurrency } from './money'
import { defaultDayIn, monthRange, useMonth } from './month'
import { useEditDialog } from './use-edit-dialog'

export function WithdrawalsPage(): ReactElement {
  const [month, setMonth] = useMonth()
  const [from, to] = monthRange(month)
  const { data: rows } = useApi('finance', 'withdrawals', { from, to }, KEEP_PERIOD)
  const { data: platformList = [] } = useApi('platforms', 'list', { includeArchived: true })
  const remove = useApiMutation('finance', 'removeWithdrawal', {
    successMessage: 'Виведення видалено'
  })
  const dialog = useEditDialog<Withdrawal>()
  const platformName = new Map(platformList.map((p) => [p.id, p.name]))

  const totals = {
    amount: sumByCurrency(rows, (w) => [w.currency, w.amount]),
    fee: sumByCurrency(rows, (w) => [w.currency, w.fee]),
    received: sumByCurrency(rows, (w) => [w.receivedCurrency, w.received])
  }

  return (
    <Page>
      <PageHeader
        title="Виведення"
        subtitle="Гроші, виведені з платформ, і скільки надійшло на картку."
        actions={
          <>
            <MonthSwitcher month={month} onChange={setMonth} />
            <Button variant="lime" onClick={() => dialog.openWith(null)}>
              <Plus /> Додати виведення
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
            title="Цього місяця виведень немає"
            hint="Запишіть виведення, щоб бачити, скільки грошей ще лежить на платформі й скільки з’їли комісії та курс."
            action={
              <Button variant="soft" onClick={() => dialog.openWith(null)}>
                <Plus /> Додати виведення
              </Button>
            }
          />
        ) : (
          <div className="@container flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
              <MoneyStatTile label="Виведено" value={totals.amount} empty="ще немає" />
              <MoneyStatTile label="Комісії за виведення" value={totals.fee} empty="без комісій" />
              <MoneyStatTile
                tone="ink"
                label="Надійшло"
                value={totals.received}
                empty="ще немає"
                hint="після комісії та обміну"
              />
            </div>
            <Card className="py-2">
              <CardContent className="px-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Звідки</TableHead>
                      <TableHead className="text-right">Сума</TableHead>
                      <TableHead className="text-right">Комісія</TableHead>
                      <TableHead className="text-right">Курс</TableHead>
                      <TableHead className="text-right">Надійшло</TableHead>
                      <TableHead className="pl-6">Спосіб</TableHead>
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
                            <span className="text-muted-foreground">Інше</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtMoney(w.amount, w.currency)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {w.fee ? fmtMoney(w.fee, w.currency) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {w.currency === w.receivedCurrency ? '—' : fmtRate(w.rate)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {fmtMoney(w.received, w.receivedCurrency)}
                        </TableCell>
                        <TableCell className="w-full max-w-0 pl-6 text-muted-foreground">
                          <span className="block truncate" title={w.method || undefined}>
                            {w.method || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <IconAction label="Змінити" onClick={() => dialog.openWith(w)}>
                              <Pencil />
                            </IconAction>
                            <Confirm
                              title="Видалити виведення?"
                              description="Запис буде видалено без можливості відновлення."
                              onConfirm={() => remove.mutate(w.id)}
                            >
                              <IconAction
                                label="Видалити виведення"
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 />
                              </IconAction>
                            </Confirm>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2}>Разом</TableCell>
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
        key={dialog.key}
        open={dialog.open}
        onOpenChange={dialog.setOpen}
        withdrawal={dialog.editing}
        defaultAt={defaultDayIn(month)}
      />
    </Page>
  )
}
