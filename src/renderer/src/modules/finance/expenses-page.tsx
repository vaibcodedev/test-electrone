import { useState, type ReactNode } from 'react'
import { ExternalLink, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import type {
  Expense,
  MoneyByCurrency,
  Subscription,
  SubscriptionMonthRow
} from '@shared/domain/finance'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtDate, fmtMoney } from '@/lib/format'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import { Skeleton } from '@/components/ui/skeleton'
import { CATEGORY_LABEL, FinanceNav, MoneyLines, MonthSwitcher } from './parts'
import { ExpenseDialog, SubscriptionDialog } from './dialogs'
import { monthName, monthRange, useMonth } from './month'

function IconAction({
  label,
  onClick,
  children,
  className
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={onClick}
          className={className}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Paid checkbox + optional "paid a different amount" popover. */
function PaidCell({ row, month }: { row: SubscriptionMonthRow; month: string }) {
  const setPaid = useApiMutation('finance', 'setSubscriptionPaid')
  const [amount, setAmount] = useState(String(row.paidAmount ?? row.amount))
  const paid = !!row.expenseId
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={paid}
        aria-label={paid ? 'Снять отметку об оплате' : 'Отметить оплаченным'}
        onCheckedChange={(v) => setPaid.mutate({ id: row.id, month, paid: v === true })}
        className="size-5 rounded-full data-[state=checked]:border-lime data-[state=checked]:bg-lime data-[state=checked]:text-lime-foreground"
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="subtle" size="xs">
            {paid && row.paidAmount !== null && row.paidAmount !== row.amount
              ? fmtMoney(row.paidAmount, row.currency)
              : 'Другая сумма'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 rounded-2xl" align="start">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const n = Number(amount.replace(',', '.'))
              if (Number.isFinite(n) && n >= 0)
                setPaid.mutate({ id: row.id, month, paid: true, amount: n })
            }}
          >
            <span className="text-[12.5px] text-muted-foreground">
              Сколько списали в {monthName(month)}, {row.currency}
            </span>
            <Input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button type="submit" size="sm" variant="lime">
              Отметить оплаченным
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function SubscriptionsSection({ month }: { month: string }) {
  const { data: rows } = useApi('finance', 'subscriptionMonth', { month })
  const { data: all = [] } = useApi('finance', 'subscriptions')
  const remove = useApiMutation('finance', 'removeSubscription', {
    successMessage: 'Подписка удалена'
  })
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const inactive = all.filter((s) => !s.active)

  const total: MoneyByCurrency = {}
  const paidTotal: MoneyByCurrency = {}
  for (const r of rows ?? []) {
    total[r.currency] = (total[r.currency] ?? 0) + r.amount
    if (r.expenseId)
      paidTotal[r.currency] = (paidTotal[r.currency] ?? 0) + (r.paidAmount ?? r.amount)
  }
  const openDialog = (s: Subscription | null): void => {
    setEditing(s)
    setDialogOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-[20px] text-foreground">
          Подписки на {monthName(month)}
        </CardTitle>
        <CardDescription>
          Отметьте, что уже списалось, — отметка превращается в расход этого месяца.
        </CardDescription>
        <CardAction>
          <Button variant="soft" size="sm" onClick={() => openDialog(null)}>
            <Plus /> Подписка
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2">
        {!rows ? (
          <Skeleton className="mx-3 h-24 rounded-2xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Подписок нет"
            hint="Добавьте регулярные платежи: Claude, телефон, интернет, хостинг. Каждый месяц они будут появляться здесь."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Оплачено</TableHead>
                <TableHead>Подписка</TableHead>
                <TableHead>Списание</TableHead>
                <TableHead>Категория</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={r.expenseId ? 'selected' : undefined}>
                  <TableCell>
                    <PaidCell row={r} month={month} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.title}
                    {r.period === 'yearly' && (
                      <Badge variant="soft" className="ml-2">
                        раз в год
                      </Badge>
                    )}
                    {!r.active && (
                      <Badge variant="outline" className="ml-2">
                        отключена
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {fmtDate(r.dueAt, 'd MMM')}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {CATEGORY_LABEL[r.category]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMoney(r.amount, r.currency)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {r.url && (
                        <IconAction
                          label="Открыть сайт"
                          onClick={() => void api.app.openExternal(r.url)}
                        >
                          <ExternalLink />
                        </IconAction>
                      )}
                      <IconAction label="Изменить" onClick={() => openDialog(r)}>
                        <Pencil />
                      </IconAction>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Всего за месяц · оплачено</TableCell>
                <TableCell className="text-right">
                  <span className="flex flex-col items-end">
                    <MoneyLines value={total} className="items-end" />
                    <MoneyLines
                      value={paidTotal}
                      className="items-end text-muted-foreground"
                      emptyLabel="ничего не оплачено"
                    />
                  </span>
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
        {inactive.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 px-3 text-[12.5px] text-muted-foreground">
            Отключённые:
            {inactive.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-0.5">
                <Button variant="soft" size="xs" onClick={() => openDialog(s)}>
                  {s.title}
                </Button>
                <Confirm
                  title={`Удалить подписку «${s.title}»?`}
                  description="Прошлые расходы по ней останутся в истории."
                  onConfirm={() => remove.mutate(s.id)}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Удалить ${s.title}`}
                    className="hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </Confirm>
              </span>
            ))}
          </div>
        )}
      </CardContent>
      <SubscriptionDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subscription={editing}
      />
    </Card>
  )
}

function ExpensesSection({ month }: { month: string }) {
  const [from, to] = monthRange(month)
  const { data: rows } = useApi('finance', 'expenses', { from, to })
  const remove = useApiMutation('finance', 'removeExpense', { successMessage: 'Расход удалён' })
  const [editing, setEditing] = useState<Expense | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nowTs] = useState(() => Date.now())
  const defaultAt = nowTs >= from && nowTs <= to ? nowTs : from + 12 * 3600_000

  const total: MoneyByCurrency = {}
  const byCategory = new Map<string, { label: string; amount: MoneyByCurrency }>()
  for (const e of rows ?? []) {
    total[e.currency] = (total[e.currency] ?? 0) + e.amount
    const cat = byCategory.get(e.category) ?? { label: CATEGORY_LABEL[e.category], amount: {} }
    cat.amount[e.currency] = (cat.amount[e.currency] ?? 0) + e.amount
    byCategory.set(e.category, cat)
  }
  const openDialog = (e: Expense | null): void => {
    setEditing(e)
    setDialogOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-[20px] text-foreground">
          Расходы за {monthName(month)}
        </CardTitle>
        <CardDescription>
          Оплаченные подписки попадают сюда автоматически. Покупки коннектов считаются отдельно на
          странице платформы.
        </CardDescription>
        <CardAction>
          <Button variant="lime" size="sm" onClick={() => openDialog(null)}>
            <Plus /> Расход
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-2">
        {!rows ? (
          <Skeleton className="mx-3 h-24 rounded-2xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Расходов нет"
            hint="Добавьте разовую трату или отметьте оплаченную подписку выше."
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
                  <TableHead>На что</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {fmtDate(e.at, 'd MMM')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {e.title}
                      {e.subscriptionId && (
                        <Badge variant="soft" className="ml-2">
                          подписка
                        </Badge>
                      )}
                      {e.note && (
                        <div className="truncate text-[12px] font-normal text-muted-foreground">
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
                        <IconAction label="Изменить" onClick={() => openDialog(e)}>
                          <Pencil />
                        </IconAction>
                        <Confirm
                          title="Удалить расход?"
                          description={`«${e.title}» будет удалён без возможности восстановления.`}
                          onConfirm={() => remove.mutate(e.id)}
                        >
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Удалить расход"
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
                  <TableCell colSpan={3}>Итого</TableCell>
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
      <ExpenseDialog
        key={editing?.id ?? `new-${month}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        expense={editing}
        defaultAt={defaultAt}
      />
    </Card>
  )
}

export function ExpensesPage() {
  const [month, setMonth] = useMonth()
  return (
    <Page>
      <PageHeader
        title="Подписки и расходы"
        subtitle="Регулярные платежи отмечаются по месяцам, разовые траты — отдельно."
        actions={<MonthSwitcher month={month} onChange={setMonth} />}
      >
        <FinanceNav />
      </PageHeader>
      <PageBody>
        <div className="flex flex-col gap-3">
          <SubscriptionsSection month={month} />
          <ExpensesSection month={month} />
        </div>
      </PageBody>
    </Page>
  )
}
