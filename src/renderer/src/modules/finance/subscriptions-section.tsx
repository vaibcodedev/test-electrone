import { useId, useState, type ReactElement } from 'react'
import { ExternalLink, HandCoins, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { ENTITY_META } from '@shared/entity-types'
import {
  expenseInputSchema,
  type Subscription,
  type SubscriptionMonthRow
} from '@shared/domain/finance'
import { openUrl } from '@/lib/open-url'
import { rangesOf } from '@/lib/limits'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
import { fmtDayFull, fmtMoney } from '@/lib/format'
import { NumberField } from '@/components/common/number-field'
import { MoneyLines } from '@/components/common/money-value'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { SubmitButton } from '@/components/common/submit-button'
import { useFormGate } from '@/hooks/use-form-gate'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
import { CardState } from './parts'
import { SubscriptionDialog } from './subscription-dialog'
import { CATEGORY_LABEL, sumByCurrency } from './money'
import { monthName, noSubscriptionsDue } from './month'
import { useEditDialog } from './use-edit-dialog'

const AMOUNT_RANGE = rangesOf(expenseInputSchema).amount

/** Removal is permanent (unlike «У кошик»), and the confirm says so. */
const REMOVE_SUB_TEXT =
  'Підписку буде видалено без можливості відновлення. Минулі витрати за нею залишаться в історії.'

/** A subscription the client pays: on the list and in the calendar, but in none of my sums. */
export function ClientPaysBadge(): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="info" tabIndex={0}>
          Платить клієнт
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Не рахується в моїх витратах і підсумках — лише нагадування в списку й календарі.
      </TooltipContent>
    </Tooltip>
  )
}

/** «Paid a different amount» popover behind an icon in the actions column. */
function PaidAmountAction({
  row,
  month
}: {
  row: SubscriptionMonthRow
  month: string
}): ReactElement {
  const id = useId()
  const setPaid = useApiMutation('finance', 'setSubscriptionPaid', {
    successMessage: 'Підписку позначено оплаченою'
  })
  const [amount, setAmount] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  // Neither an empty field nor 0 is a payment: the same «more than 0» rule as the dialogs.
  const canSubmit = amount !== null && amount > 0 && !setPaid.isPending
  // An empty sum (required) or one out of range: the button is off and Enter marks nothing.
  const { attach, reason, submit: gate } = useFormGate(open)
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
          <HandCoins />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent className="w-64 rounded-2xl" align="end">
        <form
          ref={attach}
          className="flex flex-col gap-3"
          onSubmit={(e) =>
            gate(e, () => {
              if (!canSubmit || amount === null) return
              setPaid.mutate(
                { id: row.id, month, paid: true, amount },
                { onSuccess: () => setOpen(false) }
              )
            })
          }
        >
          <NumberField
            id={id}
            label={`Скільки списали за ${monthName(month)}`}
            unit={row.currency}
            autoFocus
            live
            {...AMOUNT_RANGE}
            value={amount}
            onCommit={setAmount}
            required
          />
          <SubmitButton
            size="sm"
            variant="lime"
            reason={reason ?? (amount === 0 ? 'Сума має бути більше 0' : undefined)}
            disabled={!canSubmit}
          >
            Позначити оплаченою
          </SubmitButton>
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
  const navigate = useNavigate()
  const paid = !!r.expenseId
  const owner = r.credential?.owner
  return (
    <TableRow data-state={paid ? 'selected' : undefined}>
      <TableCell>
        <Checkbox
          checked={paid}
          aria-label={
            paid ? `Зняти позначку оплати з «${r.title}»` : `Позначити «${r.title}» оплаченою`
          }
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
          {!r.ownExpense && <ClientPaysBadge />}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
        {fmtDayFull(r.dueAt)}
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
          {r.credential && owner && (
            <IconAction
              label={`Доступ «${r.credential.label}»`}
              onClick={() => navigate(ENTITY_META[owner.type].route(owner.id))}
            >
              <KeyRound />
            </IconAction>
          )}
          <PaidAmountAction row={r} month={month} />
          <IconAction label="Змінити" onClick={onEdit}>
            <Pencil />
          </IconAction>
          <Confirm
            title={`Видалити підписку «${r.title}»?`}
            description={REMOVE_SUB_TEXT}
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

  // What the client pays is listed, but it is not my money: the sums leave it out.
  const mine = rows?.filter((r) => r.ownExpense)
  const total = sumByCurrency(mine, (r) => [r.currency, r.amount])
  const paidTotal = sumByCurrency(
    mine?.filter((r) => r.expenseId),
    (r) => [r.currency, r.paidAmount ?? r.amount]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-heading text-foreground">
          Підписки на {monthName(month)}
        </CardTitle>
        {/* Empty: no table to explain, and the button lives in the card's empty state, not twice. */}
        {rows && rows.length > 0 && (
          <>
            <CardDescription>
              Позначте, що вже списалося: позначка стає витратою за {monthName(month)}.
            </CardDescription>
            <CardAction>
              <Button variant="subtle" size="xs" onClick={() => dialog.openWith(null)}>
                <Plus /> Додати підписку
              </Button>
            </CardAction>
          </>
        )}
      </CardHeader>
      <CardContent className="px-2">
        {!rows ? (
          <Skeleton className="mx-3 h-24 rounded-2xl" />
        ) : rows.length === 0 ? (
          <CardState
            text={
              // Yearly ones billed in another month, or a month before they started: not «add some».
              all.some((s) => s.active)
                ? noSubscriptionsDue(month)
                : 'Додайте регулярні платежі — Claude, телефон, хостинг. Щомісяця вони з’являтимуться тут.'
            }
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
                <Button
                  variant="soft"
                  size="xs"
                  className="max-w-[24ch]"
                  title={s.title}
                  onClick={() => dialog.openWith(s)}
                >
                  <span className="truncate">{s.title}</span>
                </Button>
                <Confirm
                  title={`Видалити підписку «${s.title}»?`}
                  description={REMOVE_SUB_TEXT}
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
