import { Navigate, useParams } from 'react-router'
import { StickyNote } from 'lucide-react'
import { useApi } from '@/lib/query'
import { EmptyState } from '@/components/common/page'

/** /cards/:id (from search, links, notifications) → the card's board with the card sheet open. */
export function CardRedirect() {
  const { id = '' } = useParams()
  const { data: card, isLoading } = useApi('cards', 'get', id)
  if (isLoading) return null
  if (!card) return <EmptyState icon={StickyNote} title="Карточка не найдена" hint="Возможно, она в корзине." />
  return <Navigate to={`/boards/${card.boardId}?card=${card.id}`} replace />
}
