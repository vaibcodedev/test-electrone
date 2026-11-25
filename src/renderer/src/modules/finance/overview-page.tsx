import type { ReactElement } from 'react'
import { CircleAlert } from 'lucide-react'
import { KEEP_PERIOD, useApi } from '@/lib/query'
import { fmtMoney, plural } from '@/lib/format'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { Skeleton } from '@/components/ui/skeleton'
import { FinanceNav, MonthSwitcher, MoneyStatTile } from './parts'
import { addMoney, moneyEntries } from './money'
import { defaultDayIn, useMonth } from './month'
import { useEditDialog } from './use-edit-dialog'
import { YearChart } from './year-chart'
import { ExpensesByCategory, PlatformBalances, UnpaidSubscriptions } from './overview-cards'
import { SubscriptionDialog } from './subscription-dialog'
import { ExpenseDialog } from './expense-dialog'
import { WithdrawalDialog } from './withdrawal-dialog'

type AddKind = 'subscription' | 'expense' | 'withdrawal'

export function FinanceOverviewPage(): ReactElement {
  const [month, setMonth] = useMonth()
  const { data: report } = useApi('finance', 'month', { month }, KEEP_PERIOD)
  // Empty cards add records right here instead of sending you to another tab.
  const add = useEditDialog<AddKind>()
  const subsLeft = report ? report.subscriptionsDue - report.subscriptionsPaid : 0
  const credits = moneyEntries(report?.creditPurchases)

  return (
    <Page>
      <PageHeader
        title="Фінанси"
        subtitle="Доходи, витрати й прибуток за місяць. Валюти не змішуються."
        actions={<MonthSwitcher month={month} onChange={setMonth} />}
      >
        <FinanceNav />
      </PageHeader>
      <PageBody>
        {/* Container queries, not the window: the grid follows the space the page really has. */}
        <div className="@container flex flex-col gap-3">
          {!report ? (
            <div className="stagger grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-32 rounded-3xl" />
              ))}
            </div>
          ) : (
            <>
              <div className="stagger grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
                <MoneyStatTile
                  label="Отримано"
                  value={report.gross}
                  empty="ще немає оплат"
                  hint="оплати за контрактами"
                />
                <MoneyStatTile label="Комісії платформ" value={report.fees} empty="без комісій" />
                <MoneyStatTile
                  label="На руки"
                  value={report.net}
                  empty="ще немає оплат"
                  hint="після комісій"
                />
                <MoneyStatTile
                  label="Витрати"
                  value={addMoney(report.expenses, report.creditPurchases)}
                  empty="ще немає витрат"
                  hint={
                    credits.length
                      ? `включно з конектами: ${credits.map(([c, v]) => fmtMoney(v, c)).join(', ')}`
                      : 'підписки й разові'
                  }
                />
                <MoneyStatTile
                  tone="ink"
                  label="Прибуток"
                  value={report.profit}
                  empty="з’явиться після першої оплати"
                  hint={
                    subsLeft > 0 ? (
                      // Text, not a warn badge: on ink only ink-* tokens keep the contrast (dark theme).
                      <span className="inline-flex items-start gap-1.5 font-medium text-ink-foreground">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                        {`${subsLeft} ${plural(subsLeft, ['підписку', 'підписки', 'підписок'])} не позначено`}
                      </span>
                    ) : (
                      'на руки − витрати − комісії за виведення'
                    )
                  }
                />
              </div>
              <YearChart month={month} />
              {/* Equal-height cards; empty ones centre their compact state. */}
              <div className="grid grid-cols-1 items-stretch gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
                <UnpaidSubscriptions month={month} onAdd={() => add.openWith('subscription')} />
                <PlatformBalances month={month} onAdd={() => add.openWith('withdrawal')} />
                <ExpensesByCategory month={month} onAdd={() => add.openWith('expense')} />
              </div>
            </>
          )}
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
      {add.editing === 'withdrawal' && (
        <WithdrawalDialog
          key={add.key}
          open={add.open}
          onOpenChange={add.setOpen}
          defaultAt={defaultDayIn(month)}
        />
      )}
    </Page>
  )
}
