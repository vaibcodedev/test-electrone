/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function EnglishPage() {
  return (
    <Page>
      <PageHeader title="Английский" subtitle="Раздел в разработке" />
    </Page>
  )
}

export function ReviewPage() {
  return (
    <Page>
      <PageHeader title="Повторение" subtitle="Раздел в разработке" />
    </Page>
  )
}
