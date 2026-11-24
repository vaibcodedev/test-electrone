import { useState, type ReactNode } from 'react'
import { openUrl } from '@/lib/open-url'
import { ExternalLink, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import {
  expenseInputSchema,
  type Expense,
  type MoneyByCurrency,
  type Subscription,
  type SubscriptionMonthRow
} from '@shared/domain/finance'
import { rangesOf } from '@/lib/limits'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
import { NumberInput } from '@/components/common/number-input'
import { draftToNumber, numberToDraft } from '../crm/money'
import { fmtDate, fmtMoney } from '@/lib/format'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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

const AMOUNT_RANGE = rangesOf(expenseInputSchema).amount

/** Paid checkbox + optional "paid a different amount" popover. */
function PaidCell({ row, month }: { row: SubscriptionMonthRow; month: string }) {
  const setPaid = useApiMutation('finance', 'setSubscriptionPaid')
  const [amount, setAmount] = useState(String(row.paidAmount ?? row.amount))
  const [open, setOpen] = useState(false)
  const paid = !!row.expenseId
  // An empty field is not «paid 0»: the button waits for a number.
  const typed = draftToNumber(amount)
  const canSubmit = typed !== null && Number.isFinite(typed) && typed >= 0 && !setPaid.isPending
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={paid}
        aria-label={paid ? 'Зняти позначку про оплату' : 'Позначити оплаченим'}
        onCheckedChange={(v) => setPaid.mutate({ id: row.id, month, paid: v === true })}
        className="size-5 rounded-full data-[state=checked]:border-lime data-[state=checked]:bg-lime data-[state=checked]:text-lime-foreground"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="subtle" size="xs">
            {paid && row.paidAmount !== null && row.paidAmount !== row.amount
              ? fmtMoney(row.paidAmount, row.currency)
              : 'Інша сума'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 rounded-2xl" align="start">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!canSubmit || typed === null) return
              setPaid.mutate(
                { id: row.id, month, paid: true, amount: typed },
                { onSuccess: () => setOpen(false) }
              )
            }}
          >
            <span className="text-caption text-muted-foreground">
              Скільки списали за {monthName(month)}, {row.currency}
            </span>
            <NumberInput
              autoFocus
              allowEmpty
              {...AMOUNT_RANGE}
              value={typed}
              onChange={(v) => setAmount(numberToDraft(v))}
            />
            <Button type="submit" size="sm" variant="lime" disabled={!canSubmit}>
              Позначити оплаченим
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function SubscriptionsSection({ month }: { month: string }) {
  const { data: rows } = useApi('finance', 'subscriptionMonth', { month }, KEEP_PERIOD)
  const { data: all = [] } = useApi('finance', 'subscriptions')
  const remove = useApiMutation('finance', 'removeSubscription', {
    successMessage: 'Підписку видалено'
  })
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // New key per opening: a form closed with «Скасувати» never shows its unsaved values again.
  const [openSeq, setOpenSeq] = useState(0)
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
    setOpenSeq((n) => n + 1)
    setDialogOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-heading text-foreground">
          Підписки на {monthName(month)}
        </CardTitle>
        <CardDescription>
          Позначте, що вже списалося, — позначка стає витратою цього місяця.
        </CardDescription>
        <CardAction>
          <Button variant="subtle" size="xs" onClick={() => openDialog(null)}>
            <Plus /> Підписка
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2">
        {!rows ? (
          <Skeleton className="mx-3 h-24 rounded-2xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Підписок немає"
            hint="Додайте регулярні платежі: Claude, телефон, інтернет, хостинг. Щомісяця вони з’являтимуться тут."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Оплачено</TableHead>
                <TableHead>Підписка</TableHead>
                <TableHead>Списання</TableHead>
                <TableHead>Категорія</TableHead>
                <TableHead className="text-right">Сума</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-state={r.expenseId ? 'selected' : undefined}>
                  <TableCell>
                    <PaidCell row={r} month={month} />
                  </TableCell>
                  <TableCell className="w-full max-w-0 font-medium">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate" title={r.title}>
                        {r.title}
                      </span>
                      {r.period === 'yearly' && <Badge variant="soft">раз на рік</Badge>}
                      {!r.active && <Badge variant="outline">вимкнена</Badge>}
                    </div>
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
                          label="Відкрити сайт"
                          onClick={() => void openUrl(r.url)}
                        >
                          <ExternalLink />
                        </IconAction>
                      )}
                      <IconAction label="Змінити" onClick={() => openDialog(r)}>
                        <Pencil />
                      </IconAction>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Усього за місяць · оплачено</TableCell>
                <TableCell className="text-right">
                  <span className="flex flex-col items-end">
                    <MoneyLines value={total} className="items-end" />
                    <MoneyLines
                      value={paidTotal}
                      className="items-end text-muted-foreground"
                      emptyLabel="нічого не оплачено"
                    />
                  </span>
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
        {inactive.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 px-3 text-caption text-muted-foreground">
            Вимкнені:
            {inactive.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-0.5">
                <Button variant="soft" size="xs" onClick={() => openDialog(s)}>
                  {s.title}
                </Button>
                <Confirm
                  title={`Видалити підписку «${s.title}»?`}
                  description="Минулі витрати за нею залишаться в історії."
                  onConfirm={() => remove.mutate(s.id)}
                >
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Видалити ${s.title}`}
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
        key={`${editing?.id ?? 'new'}-${openSeq}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        subscription={editing}
      />
    </Card>
  )
}

function ExpensesSection({ month }: { month: string }) {
  const [from, to] = monthRange(month)
  const { data: rows } = useApi('finance', 'expenses', { from, to }, KEEP_PERIOD)
  const remove = useApiMutation('finance', 'removeExpense', { successMessage: 'Витрату видалено' })
  const [editing, setEditing] = useState<Expense | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // New key per opening: a form closed with «Скасувати» never shows its unsaved values again.
  const [openSeq, setOpenSeq] = useState(0)
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
    setOpenSeq((n) => n + 1)
    setDialogOpen(true)
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
        <CardAction>
          <Button variant="subtle" size="xs" onClick={() => openDialog(null)}>
            <Plus /> Витрата
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-2">
        {!rows ? (
          <Skeleton className="mx-3 h-24 rounded-2xl" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Витрат немає"
            hint="Додайте разову витрату або позначте оплачену підписку вище."
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
                        <IconAction label="Змінити" onClick={() => openDialog(e)}>
                          <Pencil />
                        </IconAction>
                        <Confirm
                          title="Видалити витрату?"
                          description={`«${e.title}» буде видалено без можливості відновлення.`}
                          onConfirm={() => remove.mutate(e.id)}
                        >
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Видалити витрату"
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
      <ExpenseDialog
        key={`${editing?.id ?? 'new'}-${openSeq}`}
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
        title="Підписки й витрати"
        subtitle="Регулярні платежі позначаються помісячно, разові витрати — окремо."
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
