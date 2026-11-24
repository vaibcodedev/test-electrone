/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function ReviewPage() {
  return (
    <Page>
      <PageHeader title="Итоги недели" subtitle="Раздел в разработке" />
    </Page>
  )
}
