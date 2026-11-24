/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function FinanceOverviewPage() {
  return (
    <Page>
      <PageHeader title="Финансы" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function IncomePage() {
  return (
    <Page>
      <PageHeader title="Доходы" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function ExpensesPage() {
  return (
    <Page>
      <PageHeader title="Подписки и расходы" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function WithdrawalsPage() {
  return (
    <Page>
      <PageHeader title="Выводы" subtitle="Раздел в разработке" />
    </Page>
  )
}
