/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function ComponentsPage() {
  return (
    <Page>
      <PageHeader title="Компоненты" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function ComponentPage() {
  return (
    <Page>
      <PageHeader title="Компонент" subtitle="Раздел в разработке" />
    </Page>
  )
}
