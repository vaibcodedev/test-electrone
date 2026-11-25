import type { ReactElement } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { Expense, ExpenseCategory, MoneyByCurrency } from '@shared/domain/finance'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
import { fmtDayFull, fmtMoney, fmtMoneyCompact } from '@/lib/format'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { MoneyLines } from '@/components/common/money-value'
import { moneyEntries } from '@/lib/money'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { CardState, FinanceNav, MonthSwitcher } from './parts'
import { ExpenseDialog } from './expense-dialog'
import { SubscriptionsSection } from './subscriptions-section'
import { CATEGORY_LABEL, addMoney, sumByCurrency } from './money'
import { defaultDayIn, monthName, monthRange, noneInMonth, useMonth } from './month'
import { useEditDialog } from './use-edit-dialog'

/**
 * Category badges in one pass over the table rows, not the server's expensesByCategory: that one also
 * counts connects. One line in the badge (compact), exact sums on hover: the table has the full ones.
 */
function categoryTotals(
  rows: readonly Expense[]
): { label: string; short: string; exact: string }[] {
  const byCat = new Map<ExpenseCategory, MoneyByCurrency>()
  for (const e of rows)
    byCat.set(e.category, addMoney(byCat.get(e.category), { [e.currency]: e.amount }))
  return [...byCat].map(([cat, m]) => {
    const entries = moneyEntries(m)
    return {
      label: CATEGORY_LABEL[cat],
      short: entries.map(([c, v]) => fmtMoneyCompact(v, c)).join(' · '),
      exact: entries.map(([c, v]) => fmtMoney(v, c)).join(' · ')
    }
  })
}

function ExpensesSection({
  month,
  onAdd,
  onEdit
}: {
  month: string
  onAdd: () => void
  onEdit: (e: Expense) => void
}): ReactElement {
  const [from, to] = monthRange(month)
  const { data: rows } = useApi('finance', 'expenses', { from, to }, KEEP_PERIOD)
  const remove = useApiMutation('finance', 'removeExpense', { successMessage: 'Витрату видалено' })

  const total = sumByCurrency(rows, (e) => [e.currency, e.amount])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-heading text-foreground">
          Витрати за {monthName(month)}
        </CardTitle>
        <CardDescription>
          Оплачені підписки потрапляють сюди автоматично. Купівлі конектів рахуються окремо на
          сторінці платформи.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-2">
        {!rows ? (
          <Skeleton className="mx-3 h-24 rounded-2xl" />
        ) : rows.length === 0 ? (
          <CardState
            text={noneInMonth(month, 'витрат')}
            action={
              <Button variant="subtle" size="xs" onClick={onAdd}>
                <Plus /> Додати витрату
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 px-3">
              {categoryTotals(rows).map((c) => (
                <Badge
                  key={c.label}
                  variant="soft"
                  className="h-7 gap-2 px-3"
                  title={`${c.label}: ${c.exact}`}
                >
                  {c.label}
                  <span className="font-semibold tabular-nums">{c.short}</span>
                </Badge>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>На що</TableHead>
                  <TableHead>Категорія</TableHead>
                  <TableHead className="text-right">Сума</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                      {fmtDayFull(e.at)}
                    </TableCell>
                    <TableCell className="w-full max-w-0 font-medium">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate" title={e.title}>
                          {e.title}
                        </span>
                        {e.subscriptionId && <Badge variant="soft">підписка</Badge>}
                      </div>
                      {e.note && (
                        <div
                          className="truncate text-caption font-normal text-muted-foreground"
                          title={e.note}
                        >
                          {e.note}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {CATEGORY_LABEL[e.category]}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtMoney(e.amount, e.currency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <IconAction label="Змінити" onClick={() => onEdit(e)}>
                          <Pencil />
                        </IconAction>
                        <Confirm
                          title="Видалити витрату?"
                          description={`«${e.title}» буде видалено без можливості відновлення.`}
                          onConfirm={() => remove.mutate(e.id)}
                        >
                          <IconAction
                            label="Видалити витрату"
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
                  <TableCell colSpan={3}>Разом</TableCell>
                  <TableCell className="text-right font-semibold">
                    <MoneyLines value={total} className="items-end" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function ExpensesPage(): ReactElement {
  const [month, setMonth] = useMonth()
  const expense = useEditDialog<Expense>()
  return (
    <Page>
      <PageHeader
        title="Підписки й витрати"
        subtitle="Регулярні платежі позначаються помісячно, разові витрати — окремо."
        actions={
          <>
            <MonthSwitcher month={month} onChange={setMonth} />
            <Button variant="lime" onClick={() => expense.openWith(null)}>
              <Plus /> Додати витрату
            </Button>
          </>
        }
      >
        <FinanceNav />
      </PageHeader>
      {/* Tabs of the finance hub share the shell key (handle.hub), so only the body fades in on a tab switch. */}
      <PageBody className="animate-page">
        <div className="flex flex-col gap-3">
          <SubscriptionsSection month={month} />
          <ExpensesSection
            month={month}
            onAdd={() => expense.openWith(null)}
            onEdit={expense.openWith}
          />
        </div>
      </PageBody>
      <ExpenseDialog
        key={expense.key}
        open={expense.open}
        onOpenChange={expense.setOpen}
        expense={expense.editing}
        defaultAt={defaultDayIn(month)}
      />
    </Page>
  )
}
