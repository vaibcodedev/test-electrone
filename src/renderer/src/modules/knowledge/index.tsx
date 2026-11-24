/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function KnowledgeOverviewPage() {
  return (
    <Page>
      <PageHeader title="Знания" subtitle="Раздел в разработке" />
    </Page>
  )
}
