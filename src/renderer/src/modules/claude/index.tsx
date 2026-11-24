/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function ClaudePage() {
  return (
    <Page>
      <PageHeader title="Claude" subtitle="Раздел в разработке" />
    </Page>
  )
}
