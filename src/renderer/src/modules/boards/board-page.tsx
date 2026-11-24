import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Archive, ArchiveRestore, Info, MoreHorizontal, SquareKanban, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Board, BoardPatch } from '@shared/domain/boards'
import { useApi, useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { useUi } from '@/stores/ui-store'
import { EmptyState, Page, Segmented } from '@/components/common/page'
import { InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { PinButtons } from '@/components/common/pin-buttons'
import { MarkdownField } from '@/components/common/markdown'
import { TagPicker } from '@/components/common/tags'
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

function BoardInfoSheet({ board, open, onOpenChange }: { board: Board; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useApiMutation('boards', 'update')
  const patch = (p: BoardPatch): void => update.mutate({ id: board.id, patch: p })
  const [description, setDescription] = useAutosave(board.description, (d) => patch({ description: d }))
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-6 sm:max-w-[480px]">
        <SheetTitle className="font-display text-xl">О доске</SheetTitle>
        <SheetDescription className="text-caption">Описание, метки, связи и файлы.</SheetDescription>
        <div className="mt-5 flex flex-col gap-6">
          <MarkdownField
            label="Описание"
            value={description}
            onChange={setDescription}
            placeholder="Цель, ссылки, договорённости…"
            minHeight="160px"
          />
          <section className="flex flex-col gap-2">
            <SectionLabel>Метки</SectionLabel>
            <TagPicker value={board.tags} onChange={(tagIds) => patch({ tagIds })} />
          </section>
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
      toast.success('Доска в корзине')
      navigate('/boards')
    }
  })
  const [title, setTitle] = useAutosave(board.title, (t) => t.trim() && update.mutate({ id: board.id, patch: { title: t.trim() } }))

  return (
    <header className="flex items-start gap-4 px-8 pt-6 pb-4">
      <div className="min-w-0 flex-1">
        <InlineTitle value={title} onChange={setTitle} className="font-display text-stat leading-none" />
        {board.archived && <Badge variant="outline" className="mt-2">В архиве</Badge>}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-1">
        <Segmented
          value={view}
          onChange={(v) => setView('board', v)}
          options={BOARD_VIEWS.map((v) => ({ value: v.value, label: v.label }))}
        />
        <PinButtons entity={{ type: 'board', id: board.id }} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="soft" size="icon-sm" aria-label="О доске" onClick={() => setInfoOpen(true)}>
              <Info />
            </Button>
          </TooltipTrigger>
          <TooltipContent>О доске: описание, метки, связи, файлы</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="soft" size="icon-sm" aria-label="Меню доски">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-2xl">
            <DropdownMenuItem onSelect={() => update.mutate({ id: board.id, patch: { archived: !board.archived } })}>
              {board.archived ? <ArchiveRestore /> : <Archive />}
              {board.archived ? 'Вернуть из архива' : 'В архив'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <Confirm
              title={`Удалить доску «${board.title}»?`}
              description="Доска и её карточки уйдут в корзину на 30 дней."
              onConfirm={() => remove.mutate(board.id)}
            >
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                <Trash2 /> Удалить доску
              </DropdownMenuItem>
            </Confirm>
          </DropdownMenuContent>
        </DropdownMenu>
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

  if (isLoading) return null
  if (!details) {
    return (
      <EmptyState
        icon={SquareKanban}
        title="Доска не найдена"
        hint="Возможно, она в корзине."
        action={
          <Button variant="soft" onClick={() => navigate('/boards')}>
            Все доски
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
