import { Navigate, useParams } from 'react-router'
import { StickyNote } from 'lucide-react'
import { useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { EmptyState } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'

/** /cards/:id (from search, links, notifications) → the card's board with the card sheet open. */
export function CardRedirect() {
  const { id = '' } = useParams()
  const record = useInPlaceApi('cards', 'get', id)
  const { data: card, isLoading } = record
  if (record.failed)
    return <LoadError title="Не вдалося завантажити картку" onRetry={record.retry} />
  if (isLoading) return <PageSkeleton kind="board" />
  if (!card) return <EmptyState icon={StickyNote} title="Картку не знайдено" hint="Можливо, вона в кошику." />
  return <Navigate to={`/boards/${card.boardId}?card=${card.id}`} replace />
}
