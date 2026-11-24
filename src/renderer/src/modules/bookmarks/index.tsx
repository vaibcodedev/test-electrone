/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function BookmarksPage() {
  return (
    <Page>
      <PageHeader title="Закладки" subtitle="Раздел в разработке" />
    </Page>
  )
}
