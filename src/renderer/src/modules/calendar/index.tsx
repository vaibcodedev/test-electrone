/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function CalendarPage() {
  return (
    <Page>
      <PageHeader title="Календарь" subtitle="Раздел в разработке" />
    </Page>
  )
}
