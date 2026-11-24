/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function GuidePage() {
  return (
    <Page>
      <PageHeader title="Гайд" subtitle="Раздел в разработке" />
    </Page>
  )
}
