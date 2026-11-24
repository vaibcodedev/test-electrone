/** Module entry: page components are lazy-loaded by the router. */
import { Page, PageHeader } from '@/components/common/page'

export function NotesPage() {
  return (
    <Page>
      <PageHeader title="Заметки" subtitle="Раздел в разработке" />
    </Page>
  )
}
