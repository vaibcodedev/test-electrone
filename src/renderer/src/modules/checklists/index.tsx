/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function ChecklistsPage() {
  return (
    <Page>
      <PageHeader title="Чек-листы" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function ChecklistPage() {
  return (
    <Page>
      <PageHeader title="Чек-лист" subtitle="Раздел в разработке" />
    </Page>
  )
}
