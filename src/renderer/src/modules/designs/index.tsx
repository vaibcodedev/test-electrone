/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function DesignsPage() {
  return (
    <Page>
      <PageHeader title="Дизайны" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function MoodboardPage() {
  return (
    <Page>
      <PageHeader title="Подборка" subtitle="Раздел в разработке" />
    </Page>
  )
}
