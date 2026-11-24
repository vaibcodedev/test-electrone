/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function IdeasPage() {
  return (
    <Page>
      <PageHeader title="Идеи" subtitle="Раздел в разработке" />
    </Page>
  )
}
