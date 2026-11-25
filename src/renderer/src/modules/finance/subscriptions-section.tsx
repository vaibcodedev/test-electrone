import { useId, useState, type ReactElement } from 'react'
import { Coins, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  expenseInputSchema,
  type Subscription,
  type SubscriptionMonthRow
} from '@shared/domain/finance'
import { openUrl } from '@/lib/open-url'
import { rangesOf } from '@/lib/limits'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
import { fmtDate, fmtMoney } from '@/lib/format'
import { Field } from '@/components/common/page'
import { NumberInput } from '@/components/common/number-input'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
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
import { Skeleton } from '@/components/ui/skeleton'
import { CardState, MoneyLines } from './parts'
import { SubscriptionDialog } from './subscription-dialog'
import { CATEGORY_LABEL, sumByCurrency } from './money'
import { monthName } from './month'
import { useEditDialog } from './use-edit-dialog'

const AMOUNT_RANGE = rangesOf(expenseInputSchema).amount

/** «Paid a different amount» popover behind an icon in the actions column. */
function PaidAmountAction({
  row,
  month
}: {
  row: SubscriptionMonthRow
  month: string
}): ReactElement {
  const id = useId()
  const setPaid = useApiMutation('finance', 'setSubscriptionPaid')
  const [amount, setAmount] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  // An empty field is not «paid 0»: the button waits for a number.
  const canSubmit = amount !== null && amount >= 0 && !setPaid.isPending
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        // Rows are reused across months (same key): start from this row's amount on every opening.
        if (o) setAmount(row.paidAmount ?? row.amount)
        setOpen(o)
      }}
    >
      <PopoverTrigger asChild>
        <IconAction label="Оплачено іншою сумою">
          <Coins />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-2xl" align="end">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!canSubmit || amount === null) return
            setPaid.mutate(
              { id: row.id, month, paid: true, amount },
              { onSuccess: () => setOpen(false) }
            )
          }}
        >
          <Field label={`Скільки списали за ${monthName(month)}, ${row.currency}`} htmlFor={id}>
            <NumberInput
              id={id}
              autoFocus
              allowEmpty
              {...AMOUNT_RANGE}
              value={amount}
              onChange={setAmount}
            />
          </Field>
          <Button type="submit" size="sm" variant="lime" disabled={!canSubmit}>
            Позначити оплаченою
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function SubscriptionRow({
  row: r,
  month,
  onEdit,
  onRemove
}: {
  row: SubscriptionMonthRow
  month: string
  onEdit: () => void
  onRemove: () => void
}): ReactElement {
  const setPaid = useApiMutation('finance', 'setSubscriptionPaid')
  const paid = !!r.expenseId
  return (
    <TableRow data-state={paid ? 'selected' : undefined}>
      <TableCell>
        <Checkbox
          checked={paid}
          aria-label={paid ? 'Зняти позначку про оплату' : 'Позначити оплаченою'}
          onCheckedChange={(v) => setPaid.mutate({ id: r.id, month, paid: v === true })}
        />
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
      <TableCell className="text-muted-foreground">{CATEGORY_LABEL[r.category]}</TableCell>
      <TableCell className="text-right tabular-nums">
        {fmtMoney(r.amount, r.currency)}
        {r.paidAmount !== null && r.paidAmount !== r.amount && (
          <div className="text-caption text-muted-foreground">
            сплачено {fmtMoney(r.paidAmount, r.currency)}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          {r.url && (
            <IconAction label="Відкрити сайт" onClick={() => void openUrl(r.url)}>
              <ExternalLink />
            </IconAction>
          )}
          <PaidAmountAction row={r} month={month} />
          <IconAction label="Змінити" onClick={onEdit}>
            <Pencil />
          </IconAction>
          <Confirm
            title={`Видалити підписку «${r.title}»?`}
            description="Минулі витрати за нею залишаться в історії."
            onConfirm={onRemove}
          >
            <IconAction
              label="Видалити підписку"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </IconAction>
          </Confirm>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function SubscriptionsSection({ month }: { month: string }): ReactElement {
  const { data: rows } = useApi('finance', 'subscriptionMonth', { month }, KEEP_PERIOD)
  const { data: all = [] } = useApi('finance', 'subscriptions')
  const remove = useApiMutation('finance', 'removeSubscription', {
    successMessage: 'Підписку видалено'
  })
  const dialog = useEditDialog<Subscription>()
  // A switched-off subscription paid this month is already a row in the table.
  const inactive = all.filter((s) => !s.active && !rows?.some((r) => r.id === s.id))

  const total = sumByCurrency(rows, (r) => [r.currency, r.amount])
  const paidTotal = sumByCurrency(
    rows?.filter((r) => r.expenseId),
    (r) => [r.currency, r.paidAmount ?? r.amount]
  )

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
          <Button variant="subtle" size="xs" onClick={() => dialog.openWith(null)}>
            <Plus /> Додати підписку
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2">
        {!rows ? (
          <Skeleton className="mx-3 h-24 rounded-2xl" />
        ) : rows.length === 0 ? (
          <CardState
            text="Додайте регулярні платежі — Claude, телефон, хостинг. Щомісяця вони з’являтимуться тут."
            action={
              <Button variant="subtle" size="xs" onClick={() => dialog.openWith(null)}>
                <Plus /> Додати підписку
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-0 whitespace-nowrap">Оплачено</TableHead>
                <TableHead>Підписка</TableHead>
                <TableHead>Списання</TableHead>
                <TableHead>Категорія</TableHead>
                <TableHead className="text-right">Сума</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <SubscriptionRow
                  key={r.id}
                  row={r}
                  month={month}
                  onEdit={() => dialog.openWith(r)}
                  onRemove={() => remove.mutate(r.id)}
                />
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Усього за місяць</TableCell>
                <TableCell className="text-right">
                  <MoneyLines value={total} className="items-end" />
                </TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell colSpan={4}>Оплачено</TableCell>
                <TableCell className="text-right">
                  <MoneyLines
                    value={paidTotal}
                    className="items-end text-muted-foreground"
                    emptyLabel="ще нічого"
                  />
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
                <Button variant="soft" size="xs" onClick={() => dialog.openWith(s)}>
                  {s.title}
                </Button>
                <Confirm
                  title={`Видалити підписку «${s.title}»?`}
                  description="Минулі витрати за нею залишаться в історії."
                  onConfirm={() => remove.mutate(s.id)}
                >
                  <IconAction
                    label="Видалити підписку"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </IconAction>
                </Confirm>
              </span>
            ))}
          </div>
        )}
      </CardContent>
      <SubscriptionDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={dialog.setOpen}
        subscription={dialog.editing}
        month={month}
      />
    </Card>
  )
}
