/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function FixesPage() {
  return (
    <Page>
      <PageHeader title="Ошибки и решения" subtitle="Раздел в разработке" />
    </Page>
  )
}
