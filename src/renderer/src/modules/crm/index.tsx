/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function ClientsPage() {
  return (
    <Page>
      <PageHeader title="Клиенты и проекты" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function ClientPage() {
  return (
    <Page>
      <PageHeader title="Клиент" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function ProjectPage() {
  return (
    <Page>
      <PageHeader title="Проект" subtitle="Раздел в разработке" />
    </Page>
  )
}
