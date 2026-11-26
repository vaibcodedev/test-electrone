import { SearchX } from 'lucide-react'
import { Navigate, useParams } from 'react-router'
import { useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { EmptyState } from '@/components/common/page'

/** `/freelance/proposal/:id` (global search, links) → the platform page with the proposal open. */
export function ProposalRedirect() {
  const { id = '' } = useParams()
  const record = useInPlaceApi('proposals', 'get', id, { enabled: !!id })
  const { data: proposal, isLoading } = record
  if (record.failed)
    return <LoadError title="Не вдалося завантажити відгук" onRetry={record.retry} />
  if (isLoading) return null
  if (!proposal) return <EmptyState icon={SearchX} title="Відгук не знайдено" hint="Можливо, він у кошику." />
  return (
    <Navigate
      replace
      to={`/freelance/p/${proposal.platformId}?tab=proposals&open=${proposal.id}`}
    />
  )
}
