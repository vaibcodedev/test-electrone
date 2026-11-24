import { Navigate, useParams } from 'react-router'
import { useApi } from '@/lib/query'
import { EmptyState } from '@/components/common/page'

/** `/freelance/proposal/:id` (global search, links) → the platform page with the proposal open. */
export function ProposalRedirect() {
  const { id = '' } = useParams()
  const { data: proposal, isLoading } = useApi('proposals', 'get', id, { enabled: !!id })
  if (isLoading) return null
  if (!proposal) return <EmptyState title="Отклик не найден" hint="Возможно, он в корзине." />
  return <Navigate replace to={`/freelance/p/${proposal.platformId}?tab=proposals&open=${proposal.id}`} />
}
