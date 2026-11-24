/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function SnippetsPage() {
  return (
    <Page>
      <PageHeader title="Сниппеты" subtitle="Раздел в разработке" />
    </Page>
  )
}
