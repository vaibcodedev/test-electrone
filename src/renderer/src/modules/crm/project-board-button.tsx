import type { ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronDown, SquareKanban } from 'lucide-react'
import type { BoardSummary } from '@shared/domain/boards'
import { ENTITY_META } from '@shared/entity-types'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtTitle } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

const NO_BOARDS: BoardSummary[] = []

/**
 * A kanban for the project right from its page: «Створити дошку» makes a board named after the project (the usual
 * columns) tied to it through boards.projectId and opens it; afterwards the same place reads «Дошка» and opens it.
 * Several boards — a menu of them plus «Ще одна дошка». Archived boards don't count.
 */
export function ProjectBoardButton({
  projectId,
  title
}: {
  projectId: string
  title: string
}): ReactElement {
  const navigate = useNavigate()
  const { data = NO_BOARDS, isLoading } = useApi('boards', 'list', { projectId })
  const live = data.filter((b) => !b.archived)
  const create = useApiMutation('boards', 'create', {
    openInEdit: false,
    successMessage: 'Дошку проєкту створено',
    onSuccess: (b) => navigate(ENTITY_META.board.route(b.id))
  })
  const make = (): void => create.mutate({ title: title.trim() || 'Дошка проєкту', projectId })

  if (isLoading) return <></>
  if (live.length === 1)
    return (
      <Button variant="soft" size="sm" asChild>
        <Link to={ENTITY_META.board.route(live[0].id)}>
          <SquareKanban /> Дошка
        </Link>
      </Button>
    )
  if (live.length > 1)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="soft" size="sm">
            <SquareKanban /> Дошки · {live.length} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            {live.map((b) => (
              <DropdownMenuItem key={b.id} asChild>
                <Link to={ENTITY_META.board.route(b.id)}>
                  <SquareKanban />
                  <span className="truncate">{fmtTitle(b.title)}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={create.isPending} onSelect={make}>
              Ще одна дошка
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  return (
    <Button variant="soft" size="sm" disabled={create.isPending} onClick={make}>
      <SquareKanban /> Створити дошку
    </Button>
  )
}
