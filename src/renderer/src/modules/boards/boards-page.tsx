import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Plus, SquareKanban } from 'lucide-react'
import { boardInputSchema, type BoardSummary } from '@shared/domain/boards'
import { limitsOf, requiredOf } from '@/lib/limits'
import { useApiMutation, useInfiniteApi } from '@/lib/query'
import { fmtRelative, mdPreview } from '@/lib/format'
import { EmptyState, Field, Page, PageHeader, SegmentBar } from '@/components/common/page'
import { FormDialog } from '@/components/common/form-dialog'
import { VirtualGrid } from '@/components/common/virtual-list'
import { TagList } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui-store'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { freshOnOpen } from '@/components/common/fresh-on-open'
import { bindMenu } from '@/features/record-menu/model'
import { RecordMenuTile } from '@/features/record-menu/record-menu'
import { boardMenu } from './board-menu'

const LIMITS = limitsOf(boardInputSchema)
const REQUIRED = requiredOf(boardInputSchema)

function CreateBoardDialogForm({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const create = useApiMutation('boards', 'create', {
    onSuccess: (board) => {
      // The name is already typed in this dialog: the board opens for reading, not as a fresh draft that
      // «Скасувати»/Esc would purge together with the cards added to it.
      useUi.getState().takeCreated(board.id)
      onOpenChange(false)
      setTitle('')
      setDescription('')
      navigate(`/boards/${board.id}`)
    }
  })
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Нова дошка"
      description="Колонки «Беклог → У роботі → Рев’ю → Готово» створяться самі, їх можна змінити."
      submitLabel="Створити дошку"
      pending={create.isPending}
      onSubmit={() => create.mutate({ title: title.trim(), description })}
      className="sm:max-w-md"
    >
      <Field label="Назва" htmlFor="board-title" required={REQUIRED.title}>
        <Input
          id="board-title"
          autoFocus
          value={title}
          maxLength={LIMITS.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Напр.: Bloom Store — редизайн"
        />
      </Field>
      <Field label="Опис (необов’язково)">
        <Textarea
          value={description}
          maxLength={LIMITS.description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Мета, посилання, домовленості…"
        />
      </Field>
    </FormDialog>
  )
}

/** Opens clean every time: created anew on each opening (freshOnOpen). */
const CreateBoardDialog = freshOnOpen(CreateBoardDialogForm)

function BoardTile({ board }: { board: BoardSummary }) {
  const marked = board.overdueCount > 0 || board.archived || board.tags.length > 0
  return (
    <RecordMenuTile menu={bindMenu(boardMenu, board)} buttonClassName="absolute top-4 right-4">
    <Card
      className={cn(
        // The overlay link takes the focus, so the tile draws the same inner ring that `tile` gives on focus-visible.
        'tile group relative h-full min-h-47 gap-0 p-5 has-[a:focus-visible]:shadow-[inset_0_0_0_2px_var(--ring)]',
        board.archived && 'opacity-55'
      )}
    >
      <Link
        to={`/boards/${board.id}`}
        className="absolute inset-0 rounded-3xl outline-none"
        aria-label={board.title}
      />
      {/* The title is always first, so titles of one row line up whatever badges a board has. */}
      <div className="flex min-w-0 items-start gap-1.5 pr-7">
        <CardTitle
          title={board.title}
          className="font-display line-clamp-2 min-w-0 text-stat-sm leading-tight font-normal text-foreground"
        >
          {board.title}
        </CardTitle>
        <FavoriteMark entity={{ type: 'board', id: board.id }} className="mt-1.5" />
      </div>
      {board.description && (
        <CardDescription className="mt-1 line-clamp-2 text-caption">
          {mdPreview(board.description)}
        </CardDescription>
      )}
      <div className="mt-auto pt-4">
        {/* Not positioned: the overlay link stays on top, so a click on the badges opens the board too. */}
        {marked && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {board.overdueCount > 0 && (
              <Badge variant="destructive">{board.overdueCount} прострочено</Badge>
            )}
            {board.archived && <Badge variant="outline">Архів</Badge>}
            {board.tags.length > 0 && <TagList tags={board.tags} max={3} />}
          </div>
        )}
        {/* One segment per card (up to 8), so the bar reads as "how many are done". */}
        {board.cardCount > 0 && (
          <SegmentBar
            value={board.doneCount}
            total={board.cardCount}
            segments={Math.min(board.cardCount, 8)}
          />
        )}
        <div className="mt-1.5 flex justify-between gap-3 text-meta text-muted-foreground">
          <span className="min-w-0 truncate">
            {board.cardCount ? `Готово ${board.doneCount} з ${board.cardCount}` : 'Поки без карток'}
          </span>
          <span className="shrink-0">{fmtRelative(board.updatedAt)}</span>
        </div>
      </div>
    </Card>
    </RecordMenuTile>
  )
}

export function BoardsPage() {
  const page = useInfiniteApi('boards', 'list')
  const [creating, setCreating] = useState(false)
  return (
    <Page>
      <PageHeader
        title="Дошки"
        subtitle="Окрема канбан-дошка на кожен проєкт."
        actions={
          <Button variant="lime" onClick={() => setCreating(true)}>
            <Plus /> Нова дошка
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col px-8 pb-6">
        <VirtualGrid
          items={page.items}
          loading={page.isLoading}
          getKey={(b) => b.id}
          minColumnWidth={260}
          rowHeight={200}
          hasMore={page.hasMore}
          loadingMore={page.loadingMore}
          onLoadMore={page.loadMore}
          renderItem={(b) => <BoardTile board={b} />}
          empty={
            !page.isLoading && (
              <EmptyState
                icon={SquareKanban}
                title="Дошок поки немає"
                hint="Створіть дошку вручну або перетворіть ідею на дошку однією кнопкою."
                cta={{ label: 'Нова дошка', icon: Plus, onClick: () => setCreating(true) }}
              />
            )
          }
        />
      </div>
      <CreateBoardDialog open={creating} onOpenChange={setCreating} />
    </Page>
  )
}
