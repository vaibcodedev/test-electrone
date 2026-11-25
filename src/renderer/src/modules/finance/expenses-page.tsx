import type { ReactElement } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { Expense, MoneyByCurrency } from '@shared/domain/finance'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
import { fmtDate, fmtMoney } from '@/lib/format'
import { Page, PageBody, PageHeader } from '@/components/common/page'
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
import { CardState, FinanceNav, MoneyLines, MonthSwitcher } from './parts'
import { ExpenseDialog } from './expense-dialog'
import { SubscriptionsSection } from './subscriptions-section'
import { CATEGORY_LABEL, sumByCurrency } from './money'
import { defaultDayIn, monthName, monthRange, useMonth } from './month'
import { useEditDialog } from './use-edit-dialog'

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
  // From the table rows, not the server's expensesByCategory: that one also counts connects.
  const byCategory = new Map<string, { label: string; amount: MoneyByCurrency }>()
  for (const e of rows ?? []) {
    const cat = byCategory.get(e.category) ?? { label: CATEGORY_LABEL[e.category], amount: {} }
    cat.amount[e.currency] = (cat.amount[e.currency] ?? 0) + e.amount
    byCategory.set(e.category, cat)
  }

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
            text="Цього місяця витрат немає. Оплачені підписки потраплять сюди самі."
            action={
              <Button variant="subtle" size="xs" onClick={onAdd}>
                <Plus /> Додати витрату
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 px-3">
              {[...byCategory.values()].map((c) => (
                <Badge key={c.label} variant="soft" className="h-7 gap-2 px-3">
                  {c.label}
                  <MoneyLines value={c.amount} className="font-semibold" />
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
                    <TableCell className="text-muted-foreground tabular-nums">
                      {fmtDate(e.at, 'd MMM')}
                    </TableCell>
                    <TableCell className="w-full max-w-0 font-medium">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate" title={e.title}>
                          {e.title}
                        </span>
                        {e.subscriptionId && <Badge variant="soft">підписка</Badge>}
                      </div>
                      {e.note && (
                        <div className="truncate text-caption font-normal text-muted-foreground">
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
      <PageBody>
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
