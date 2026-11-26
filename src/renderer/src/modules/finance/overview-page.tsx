import type { ReactElement } from 'react'
import { CircleAlert } from 'lucide-react'
import { KEEP_PERIOD, useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { fmtMoney, plural } from '@/lib/format'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { FinanceNav, MonthSwitcher, MoneyStatTile } from './parts'
import { moneyEntries } from '@/lib/money'
import { addMoney } from './money'
import { defaultDayIn, noneInTile, useMonth } from './month'
import { useEditDialog } from './use-edit-dialog'
import { YearChart } from './year-chart'
import { ExpensesByCategory, PlatformBalances, UnpaidSubscriptions } from './overview-cards'
import { SubscriptionDialog } from './subscription-dialog'
import { ExpenseDialog } from './expense-dialog'

type AddKind = 'subscription' | 'expense'

/**
 * Five tiles without holes: 2 columns (the last tile spans the row), then 3 + 2 on a 6-column grid,
 * then one row. The skeleton uses the same spans, so nothing jumps when data arrives.
 */
const TILE_GRID = 'stagger grid grid-cols-2 gap-3 @2xl:grid-cols-6 @5xl:grid-cols-5'
const TILE_SPANS = [
  '@2xl:col-span-2 @5xl:col-span-1',
  '@2xl:col-span-2 @5xl:col-span-1',
  '@2xl:col-span-2 @5xl:col-span-1',
  '@2xl:col-span-3 @5xl:col-span-1',
  'col-span-2 @2xl:col-span-3 @5xl:col-span-1'
]

export function FinanceOverviewPage(): ReactElement {
  const [month, setMonth] = useMonth()
  const query = useInPlaceApi('finance', 'month', { month }, KEEP_PERIOD)
  const { data: report } = query
  // Empty cards add records right here instead of sending you to another tab.
  const add = useEditDialog<AddKind>()
  const subsLeft = report ? report.subscriptionsDue - report.subscriptionsPaid : 0
  const credits = moneyEntries(report?.creditPurchases)
  const spent = addMoney(report?.expenses, report?.creditPurchases)
  // Profit exactly 0 while money moved: say «у нуль», not «no payments» next to tiles that show sums.
  const anyMoney = moneyEntries(report?.net).length > 0 || moneyEntries(spent).length > 0

  return (
    <Page>
      <PageHeader
        title="Фінанси"
        subtitle="Доходи, витрати й прибуток за місяць. Валюти не змішуються."
        actions={<MonthSwitcher month={month} onChange={setMonth} />}
      >
        <FinanceNav />
      </PageHeader>
      {/* Tabs of the finance hub share the shell key (handle.hub), so only the body fades in on a tab switch. */}
      <PageBody className="animate-page">
        {/* Container queries, not the window: the grid follows the space the page really has. */}
        <div className="@container flex flex-col gap-3">
          {query.failed ? (
            <LoadError title="Не вдалося завантажити фінанси" onRetry={query.retry} />
          ) : !report ? (
            <div className={TILE_GRID}>
              {TILE_SPANS.map((span, i) => (
                <Skeleton key={i} className={cn('h-32 rounded-3xl', span)} />
              ))}
            </div>
          ) : (
            <div className={TILE_GRID}>
              <MoneyStatTile
                className={TILE_SPANS[0]}
                label="Отримано"
                value={report.gross}
                empty={noneInTile(month, 'оплат')}
                hint="оплати за контрактами"
              />
              <MoneyStatTile
                className={TILE_SPANS[1]}
                label="Комісії платформ"
                value={report.fees}
                empty="без комісій"
              />
              <MoneyStatTile
                className={TILE_SPANS[2]}
                label="На руки"
                value={report.net}
                empty="нічого не надійшло"
                hint="після комісій"
              />
              <MoneyStatTile
                className={TILE_SPANS[3]}
                label="Витрати"
                value={spent}
                empty={noneInTile(month, 'витрат')}
                hint={
                  credits.length
                    ? `включно з конектами: ${credits.map(([c, v]) => fmtMoney(v, c)).join(', ')}`
                    : 'підписки й разові'
                }
              />
              <MoneyStatTile
                className={TILE_SPANS[4]}
                tone="ink"
                label="Прибуток"
                value={report.profit}
                empty={
                  anyMoney
                    ? 'у нуль: доходи дорівнюють витратам'
                    : noneInTile(month, 'оплат і витрат')
                }
                hint="на руки − витрати − комісії за виведення"
                warning={
                  subsLeft > 0 ? (
                    // Text, not a warn badge: on ink only ink-* tokens keep the contrast (dark theme).
                    <span className="inline-flex items-start gap-1.5 font-medium text-ink-foreground">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                      {`${subsLeft} ${plural(subsLeft, ['підписку', 'підписки', 'підписок'])} не позначено`}
                    </span>
                  ) : undefined
                }
              />
            </div>
          )}
          {/* Outside the `report` branch: chart and cards have their own queries and skeletons, so the
              page doesn't jump when they all appear at once. */}
          <YearChart month={month} />
          {/* Equal-height cards; empty ones centre their compact state. Two across, the third one
              takes the whole second row instead of leaving half of it empty. */}
          <div className="grid grid-cols-1 items-stretch gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
            <UnpaidSubscriptions month={month} onAdd={() => add.openWith('subscription')} />
            <PlatformBalances month={month} />
            <ExpensesByCategory
              className="@2xl:col-span-2 @4xl:col-span-1"
              month={month}
              rows={report?.expensesByCategory}
              onAdd={() => add.openWith('expense')}
            />
          </div>
        </div>
      </PageBody>
      {add.editing === 'subscription' && (
        <SubscriptionDialog
          key={add.key}
          open={add.open}
          onOpenChange={add.setOpen}
          month={month}
        />
      )}
      {add.editing === 'expense' && (
        <ExpenseDialog
          key={add.key}
          open={add.open}
          onOpenChange={add.setOpen}
          defaultAt={defaultDayIn(month)}
        />
      )}
    </Page>
  )
}
