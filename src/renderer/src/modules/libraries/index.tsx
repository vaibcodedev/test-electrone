/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function LibrariesPage() {
  return (
    <Page>
      <PageHeader title="JS-библиотеки" subtitle="Раздел в разработке" />
    </Page>
  )
}
