import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Archive, ArchiveRestore, Info, MoreHorizontal, SquareKanban, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { boardInputSchema, type Board, type BoardPatch } from '@shared/domain/boards'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { useUi } from '@/stores/ui-store'
import { EmptyState, Page, Segmented } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { InlineTitle } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { EditToggle, RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { MarkdownField } from '@/components/common/markdown'
import { TagsSection } from '@/components/common/tags'
import { LinksPanel } from '@/components/common/links-panel'
import { AttachmentsPanel } from '@/components/common/attachments'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BOARD_VIEWS, type BoardView } from './labels'
import { useCardParam } from './use-card-param'
import { KanbanView } from './kanban-view'
import { ListView } from './list-view'
import { CalendarView } from './calendar-view'
import { CardSheet } from './card-sheet'

const LIMITS = limitsOf(boardInputSchema)
const TITLE_EDIT_HINT = 'Спершу збережіть або скасуйте зміни назви'

function BoardInfoSheet({
  board,
  open,
  onOpenChange
}: {
  board: Board
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const update = useApiMutation('boards', 'update')
  const patch = (p: BoardPatch): void => update.mutate({ id: board.id, patch: p })
  const [description, setDescription] = useAutosave(board.description, (d) =>
    patch({ description: d })
  )
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-6 sm:max-w-[480px]">
        <SheetTitle className="font-display text-heading">Про дошку</SheetTitle>
        <SheetDescription className="text-caption">Опис, мітки, зв’язки й файли.</SheetDescription>
        <div className="mt-5 flex flex-col gap-6">
          <MarkdownField
            label="Опис"
            value={description}
            onChange={setDescription}
            placeholder="Мета, посилання, домовленості…"
            maxLength={LIMITS.description}
            minHeight="160px"
          />
          <TagsSection value={board.tags} onChange={(tagIds) => patch({ tagIds })} />
          <LinksPanel entity={{ type: 'board', id: board.id }} />
          <AttachmentsPanel entity={{ type: 'board', id: board.id }} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function BoardHeader({ board }: { board: Board }) {
  const navigate = useNavigate()
  const view = (useUi((s) => s.views.board) as BoardView | undefined) ?? 'kanban'
  const setView = useUi((s) => s.setView)
  const [infoOpen, setInfoOpen] = useState(false)
  const update = useApiMutation('boards', 'update')
  const remove = useApiMutation('boards', 'remove', {
    onSuccess: () => {
      toast.success('Дошку переміщено в кошик')
      navigate('/boards')
    }
  })
  const [title, setTitle] = useAutosave(
    board.title,
    (t) => t.trim() && update.mutate({ id: board.id, patch: { title: t.trim() } })
  )
  // Only the title follows view/edit: the kanban and the view switch work in any mode.
  const mode = useRecordMode(board.id, 'board')

  return (
    <header className="flex items-start gap-4 px-8 pt-6 pb-4">
      <RecordMode mode={mode}>
        <div className="min-w-0 flex-1">
          {/* Two lines while reading so a long name never pushes the kanban down; the whole name while editing. */}
          <InlineTitle
            value={title}
            onChange={setTitle}
            maxLength={LIMITS.title}
            placeholder="Назва дошки"
            className={mode.editing ? undefined : 'line-clamp-2'}
          />
          {board.archived && (
            <Badge variant="outline" className="mt-2">
              Архів
            </Badge>
          )}
        </div>
      </RecordMode>
      <div className="flex shrink-0 items-center gap-2 pt-1">
        <Segmented
          value={view}
          onChange={(v) => setView('board', v)}
          options={BOARD_VIEWS.map((v) => ({ value: v.value, label: v.label }))}
        />
        <PinButtons entity={{ type: 'board', id: board.id }} />
        {/* «Скасувати» of a title edit reverts the whole board row (description, tags, archive too), so those
            wait until the title is saved or cancelled. A disabled button gets no hover: the span holds the tooltip. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={mode.editing ? 0 : undefined} className="inline-flex rounded-full">
              <Button
                variant="soft"
                size="icon-sm"
                aria-label="Про дошку"
                disabled={mode.editing}
                onClick={() => setInfoOpen(true)}
              >
                <Info />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {mode.editing ? TITLE_EDIT_HINT : 'Про дошку: опис, мітки, зв’язки, файли'}
          </TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="soft" size="icon-sm" aria-label="Меню дошки">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-2xl">
            <DropdownMenuItem
              disabled={mode.editing}
              onSelect={() => update.mutate({ id: board.id, patch: { archived: !board.archived } })}
            >
              {board.archived ? <ArchiveRestore /> : <Archive />}
              <span className="flex min-w-0 flex-col">
                {board.archived ? 'Повернути з архіву' : 'В архів'}
                {mode.editing && <span className="text-meta">{TITLE_EDIT_HINT}</span>}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <Confirm
              title={`Видалити дошку «${board.title}»?`}
              description="Дошка та її картки підуть у кошик на 30 днів."
              confirmLabel="У кошик"
              onConfirm={() => remove.mutate(board.id)}
            >
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                <Trash2 /> Видалити дошку
              </DropdownMenuItem>
            </Confirm>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Last, by the right edge (DS §8); cancelling a just-created board leaves its page for the list. */}
        <EditToggle mode={mode} onClose={() => navigate('/boards')} />
      </div>
      <BoardInfoSheet board={board} open={infoOpen} onOpenChange={setInfoOpen} />
    </header>
  )
}

export function BoardPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: details, isLoading } = useApi('boards', 'details', id)
  const view = (useUi((s) => s.views.board) as BoardView | undefined) ?? 'kanban'
  const [cardId, setCardId] = useCardParam()

  if (isLoading) return <PageSkeleton kind="board" />
  if (!details) {
    return (
      <EmptyState
        icon={SquareKanban}
        title="Дошку не знайдено"
        hint="Можливо, вона в кошику."
        action={
          <Button variant="soft" onClick={() => navigate('/boards')}>
            Усі дошки
          </Button>
        }
      />
    )
  }

  return (
    <Page>
      <BoardHeader key={details.board.id} board={details.board} />
      <div className="min-h-0 flex-1">
        {view === 'kanban' && <KanbanView details={details} onOpenCard={setCardId} />}
        {view === 'list' && <ListView details={details} onOpenCard={setCardId} />}
        {view === 'calendar' && <CalendarView boardId={details.board.id} onOpenCard={setCardId} />}
      </div>
      <CardSheet cardId={cardId} columns={details.columns} onClose={() => setCardId(null)} />
    </Page>
  )
}
