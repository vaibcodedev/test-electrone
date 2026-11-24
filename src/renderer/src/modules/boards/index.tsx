/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function BoardsPage() {
  return (
    <Page>
      <PageHeader title="Доски" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function BoardPage() {
  return (
    <Page>
      <PageHeader title="Доска" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function CardRedirect() {
  return (
    <Page>
      <PageHeader title="Карточка" subtitle="Раздел в разработке" />
    </Page>
  )
}
