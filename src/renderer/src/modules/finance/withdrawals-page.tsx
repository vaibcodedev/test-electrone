import type { ReactElement } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { Withdrawal } from '@shared/domain/finance'
import { KEEP_PERIOD, useApi, useApiMutation, useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { fmtDayFull, fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
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
import { MoneyLines } from '@/components/common/money-value'
import { FinanceNav, MonthSwitcher, MoneyStatTile } from './parts'
import { WithdrawalDialog } from './withdrawal-dialog'
import { fmtRate, sumByCurrency } from './money'
import { defaultDayIn, monthRange, noneInMonth, noneInTile, useMonth } from './month'
import { useEditDialog } from './use-edit-dialog'
import { RecordMenu } from '@/features/record-menu/record-menu'
import { financeRowMenu } from './menu'

/** Secondary columns, hidden in a narrow card (body, header and footer use the same class). */
const METHOD_COL = 'hidden @2xl:table-cell'
const RATE_COL = 'hidden @xl:table-cell'

export function WithdrawalsPage(): ReactElement {
  const [month, setMonth] = useMonth()
  const [from, to] = monthRange(month)
  const query = useInPlaceApi('finance', 'withdrawals', { from, to }, KEEP_PERIOD)
  const { data: rows } = query
  const { data: platformList = [] } = useApi('platforms', 'list', { includeArchived: true })
  const remove = useApiMutation('finance', 'removeWithdrawal', {
    successMessage: 'Виплату видалено'
  })
  const dialog = useEditDialog<Withdrawal>()
  const platformName = new Map(platformList.map((p) => [p.id, p.name]))
  // No method anywhere this month: the column would spend its width on a column of «—».
  const hasMethod = rows?.some((w) => w.method) ?? false

  const totals = {
    amount: sumByCurrency(rows, (w) => [w.currency, w.amount]),
    fee: sumByCurrency(rows, (w) => [w.currency, w.fee]),
    received: sumByCurrency(rows, (w) => [w.receivedCurrency, w.received])
  }

  return (
    <Page>
      <PageHeader
        title="Виплати з платформ"
        subtitle="Гроші, виведені з платформ, і скільки надійшло на картку."
        actions={
          <>
            <MonthSwitcher month={month} onChange={setMonth} />
            <Button variant="lime" onClick={() => dialog.openWith(null)}>
              <Plus /> Додати виплату
            </Button>
          </>
        }
      >
        <FinanceNav />
      </PageHeader>
      {/* Tabs of the finance hub share the shell key (handle.hub), so only the body fades in on a tab switch. */}
      <PageBody className="animate-page">
        {query.failed ? (
          <LoadError title="Не вдалося завантажити виплати" onRetry={query.retry} />
        ) : !rows ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            illustration="money"
            title={noneInMonth(month, 'виплат')}
            hint="Запишіть виплату, щоб бачити, скільки грошей ще лежить на платформі й скільки з’їли комісії та курс."
            cta={{ label: 'Додати виплату', icon: Plus, onClick: () => dialog.openWith(null) }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* Three across when there is room; narrower, «Надійшло» takes the second row, so no sum is cut. */}
            <div className="@container">
              <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
                <MoneyStatTile
                  label="Виведено"
                  value={totals.amount}
                  empty={noneInTile(month, 'виплат')}
                />
                <MoneyStatTile
                  label="Комісії за виплати"
                  value={totals.fee}
                  empty="без комісій"
                />
                <MoneyStatTile
                  className="col-span-2 @2xl:col-span-1"
                  tone="ink"
                  label="Надійшло"
                  value={totals.received}
                  empty="ще нічого не надійшло"
                  hint="після комісії та обміну"
                />
              </div>
            </div>
            {/* The card is the container: narrow, «Спосіб» and «Курс» go first, the sums stay. */}
            <Card className="@container py-2">
              <CardContent className="px-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead className={hasMethod ? undefined : 'w-full'}>Звідки</TableHead>
                      {hasMethod && (
                        <TableHead className={cn('w-full max-w-0', METHOD_COL)}>Спосіб</TableHead>
                      )}
                      <TableHead className="text-right">Сума</TableHead>
                      <TableHead className="text-right">Комісія</TableHead>
                      <TableHead className={cn('text-right', RATE_COL)}>Курс</TableHead>
                      <TableHead className="text-right">Надійшло</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((w) => (
                      <RecordMenu
                        asChild
                        key={w.id}
                        def={financeRowMenu}
                        record={{ title: 'Виплата' }}
                        ctx={{
                          onEdit: () => dialog.openWith(w),
                          onRemove: () => remove.mutate(w.id),
                          removeConfirm: {
                            title: 'Видалити виплату?',
                            description: 'Запис буде видалено без можливості відновлення.',
                            confirmLabel: 'Видалити'
                          }
                        }}
                      >
                        <TableRow>
                          <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                            {fmtDayFull(w.at)}
                          </TableCell>
                          <TableCell>
                            {w.platformId ? (
                              <Badge variant="soft">
                                {platformName.get(w.platformId) ?? 'Платформа'}
                              </Badge>
                            ) : (
                              <Badge variant="outline">Інше</Badge>
                            )}
                            {/* The method column is hidden in a narrow card: the method moves here. */}
                            {w.method && (
                              <span
                                className="block max-w-40 truncate text-caption text-muted-foreground @2xl:hidden"
                                title={w.method}
                              >
                                {w.method}
                              </span>
                            )}
                          </TableCell>
                          {hasMethod && (
                            <TableCell
                              className={cn('w-full max-w-0 text-muted-foreground', METHOD_COL)}
                            >
                              <span className="block truncate" title={w.method || undefined}>
                                {w.method || '—'}
                              </span>
                            </TableCell>
                          )}
                          <TableCell className="text-right whitespace-nowrap tabular-nums">
                            {fmtMoney(w.amount, w.currency)}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
                            {w.fee ? fmtMoney(w.fee, w.currency) : '—'}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right whitespace-nowrap text-muted-foreground tabular-nums',
                              RATE_COL
                            )}
                          >
                            {w.currency === w.receivedCurrency ? '—' : fmtRate(w.rate)}
                          </TableCell>
                          <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                            {fmtMoney(w.received, w.receivedCurrency)}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <IconAction label="Змінити" onClick={() => dialog.openWith(w)}>
                                <Pencil />
                              </IconAction>
                              <Confirm
                                title="Видалити виплату?"
                                description="Запис буде видалено без можливості відновлення."
                                onConfirm={() => remove.mutate(w.id)}
                              >
                                <IconAction
                                  label="Видалити виплату"
                                  className="text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 />
                                </IconAction>
                              </Confirm>
                            </div>
                          </TableCell>
                        </TableRow>
                      </RecordMenu>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      {/* Hidden columns get their own hidden cells: a colSpan over them shifts the sums. */}
                      <TableCell colSpan={2}>Разом</TableCell>
                      {hasMethod && <TableCell className={METHOD_COL} />}
                      <TableCell className="text-right">
                        <MoneyLines value={totals.amount} className="items-end" />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        <MoneyLines value={totals.fee} className="items-end" />
                      </TableCell>
                      <TableCell className={RATE_COL} />
                      <TableCell className="text-right font-semibold">
                        <MoneyLines value={totals.received} className="items-end" />
                      </TableCell>
                      <TableCell />
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
