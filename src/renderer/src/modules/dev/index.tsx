/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function DevProjectsPage() {
  return (
    <Page>
      <PageHeader title="Мои проекты" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function GithubPage() {
  return (
    <Page>
      <PageHeader title="GitHub" subtitle="Раздел в разработке" />
    </Page>
  )
}
