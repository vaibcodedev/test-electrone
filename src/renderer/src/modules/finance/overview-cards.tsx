import { useMemo, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { startOfDay } from 'date-fns'
import { ArrowRight, Check, Landmark, Plus, Receipt } from 'lucide-react'
import type { Currency } from '@shared/domain/crm'
import type { MonthReport } from '@shared/domain/finance'
import { KEEP_PERIOD, useApi, useApiMutation } from '@/lib/query'
import { fmtDay, fmtPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { MoneyValue } from '@/components/common/money-value'
import { SectionLabel } from '@/components/common/master-detail'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { CardState } from './parts'
import { CATEGORY_LABEL, moneyEntries } from './money'
import { monthName } from './month'

function RowsSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-12 rounded-2xl" />
      <Skeleton className="h-12 rounded-2xl" />
    </div>
  )
}

/** Subscriptions due this month that aren't marked paid yet. */
export function UnpaidSubscriptions({
  month,
  onAdd
}: {
  month: string
  onAdd: () => void
}): ReactElement {
  const { data: rows } = useApi('finance', 'subscriptionMonth', { month }, KEEP_PERIOD)
  const setPaid = useApiMutation('finance', 'setSubscriptionPaid', {
    successMessage: 'Підписку позначено оплаченою'
  })
  const navigate = useNavigate()
  // dueAt is noon of the billing day: compare with the start of today, so today stays «спишеться».
  const today = startOfDay(new Date()).getTime()
  const dueText = (ts: number): string =>
    `${ts < today ? 'списання було' : 'спишеться'} ${fmtDay(ts)}`
  const unpaid = rows?.filter((r) => !r.expenseId) ?? []
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Не оплачено за {monthName(month)}</CardTitle>
        <CardAction>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => navigate(`/finance/expenses?month=${month}`)}
          >
            Усі підписки
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!rows ? (
          <RowsSkeleton />
        ) : unpaid.length === 0 ? (
          <CardState
            done={rows.length > 0}
            text={
              rows.length
                ? 'Усі підписки цього місяця оплачено'
                : 'Підписок немає — додайте Claude, телефон, хостинг'
            }
            action={
              <Button variant="subtle" size="xs" onClick={onAdd}>
                <Plus /> Додати підписку
              </Button>
            }
          />
        ) : (
          <ItemGroup className="gap-1.5">
            {unpaid.map((s) => (
              <Item key={s.id} size="xs" variant="muted">
                <ItemMedia variant="icon" className="bg-card">
                  <Receipt />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full truncate" title={s.title}>
                    {s.title}
                  </ItemTitle>
                  <ItemDescription className="text-caption">
                    <MoneyValue amount={s.amount} currency={s.currency} />
                  </ItemDescription>
                  <ItemDescription className="truncate text-caption" title={dueText(s.dueAt)}>
                    {dueText(s.dueAt)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="xs"
                    variant="subtle"
                    aria-label={`Позначити «${s.title}» оплаченою`}
                    disabled={setPaid.isPending}
                    onClick={() => setPaid.mutate({ id: s.id, month, paid: true })}
                  >
                    <Check /> Позначити
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}

export function PlatformBalances({ month }: { month: string }): ReactElement {
  const { data } = useApi('finance', 'overview')
  const navigate = useNavigate()
  const list = (data?.platformBalances ?? []).filter((b) => Math.abs(b.balance) >= 0.01)
  // «Усе виведено» only makes sense once something was earned; a new base gets a hint instead.
  const earned = data?.months.some((m) => moneyEntries(m.net).length > 0) ?? false
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Гроші на платформах</CardTitle>
        <CardDescription>Зароблено після комісії мінус виведено</CardDescription>
        <CardAction>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => navigate(`/finance/withdrawals?month=${month}`)}
          >
            Виведення
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!data ? (
          <RowsSkeleton />
        ) : list.length === 0 ? (
          earned ? (
            // Nothing left to withdraw: no «add» here, the header already links to withdrawals.
            <CardState done text="Усе виведено — на платформах нічого не лишилося" />
          ) : (
            <CardState
              icon={Landmark}
              text="Після першої оплати тут буде видно, скільки грошей лежить на платформах"
              action={
                <Button variant="subtle" size="xs" onClick={() => navigate('/clients')}>
                  До контрактів <ArrowRight />
                </Button>
              }
            />
          )
        ) : (
          <ItemGroup className="gap-1.5">
            {list.map((b) => (
              <Item key={b.platformId} size="xs" variant="muted">
                <ItemMedia variant="icon" className="bg-card">
                  <Landmark />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full truncate" title={b.name}>
                    {b.name}
                  </ItemTitle>
                </ItemContent>
                <ItemActions className={b.balance < 0 ? 'text-destructive' : 'font-medium'}>
                  <MoneyValue amount={b.balance} currency={b.currency} />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  )
}

type CategoryRow = { label: string; amount: number; share: number; rest?: boolean }

/**
 * Each category as a share of the month total (per currency), top 5 + the rest. Every row is
 * labelled, so all bars share one colour: colour by rank repainted a category between months.
 */
export function ExpensesByCategory({
  rows,
  onAdd
}: {
  rows: MonthReport['expensesByCategory']
  onAdd: () => void
}): ReactElement {
  const groups = useMemo(() => {
    const byCurrency = new Map<Currency, { label: string; amount: number }[]>()
    for (const r of rows) {
      const list = byCurrency.get(r.currency) ?? []
      list.push({ label: CATEGORY_LABEL[r.category], amount: r.amount })
      byCurrency.set(r.currency, list)
    }
    return [...byCurrency.entries()].map(([currency, list]) => {
      const sorted = [...list].sort((a, b) => b.amount - a.amount)
      const total = sorted.reduce((sum, x) => sum + x.amount, 0) || 1
      const items: CategoryRow[] = sorted
        .slice(0, 5)
        .map((x) => ({ ...x, share: (x.amount / total) * 100 }))
      const rest = sorted.slice(5).reduce((sum, x) => sum + x.amount, 0)
      if (rest > 0)
        items.push({
          label: 'Решта категорій',
          amount: rest,
          share: (rest / total) * 100,
          rest: true
        })
      return { currency, items }
    })
  }, [rows])
  const percent = (share: number): string =>
    share > 0 && share < 0.5 ? '<1%' : fmtPercent(Math.round(share))

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Витрати за категоріями</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {groups.length === 0 ? (
          <CardState
            text="Цього місяця витрат немає"
            action={
              <Button variant="subtle" size="xs" onClick={onAdd}>
                <Plus /> Додати витрату
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.currency} className="flex flex-col gap-3">
                {groups.length > 1 && <SectionLabel>{g.currency}</SectionLabel>}
                {g.items.map((r) => (
                  <div key={r.label} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline gap-2 text-body">
                      <span className="min-w-16 flex-1 truncate" title={r.label}>
                        {r.label}
                      </span>
                      <span className="font-medium">
                        <MoneyValue amount={r.amount} currency={g.currency} />
                      </span>
                      <span className="w-10 shrink-0 text-right text-caption text-muted-foreground tabular-nums">
                        {percent(r.share)}
                      </span>
                    </div>
                    <Progress
                      value={r.share}
                      aria-label={`${r.label}: ${percent(r.share)}`}
                      className={cn(
                        'h-1.5',
                        r.rest && '[&>[data-slot=progress-indicator]]:bg-muted-foreground'
                      )}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
