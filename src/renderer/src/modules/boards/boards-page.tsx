import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight, Plus, SquareKanban } from 'lucide-react'
import type { BoardSummary } from '@shared/domain/boards'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtRelative, plural } from '@/lib/format'
import { EmptyState, Field, Page, PageBody, PageHeader, SegmentBar } from '@/components/common/page'
import { TagList } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function CreateBoardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const create = useApiMutation('boards', 'create', {
    onSuccess: (board) => {
      onOpenChange(false)
      setTitle('')
      setDescription('')
      navigate(`/boards/${board.id}`)
    }
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Новая доска</DialogTitle>
          <DialogDescription>Колонки «Бэклог → В работе → Ревью → Готово» создадутся сами, их можно поменять.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim()) create.mutate({ title: title.trim(), description })
          }}
        >
          <Field label="Название">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, Bloom Store — редизайн" />
          </Field>
          <Field label="Описание">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Необязательно" />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="lime" disabled={!title.trim() || create.isPending}>
              Создать доску
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BoardTile({ board }: { board: BoardSummary }) {
  const navigate = useNavigate()
  const open = board.cardCount - board.doneCount
  return (
    <button
      type="button"
      onClick={() => navigate(`/boards/${board.id}`)}
      className={cn(
        'group flex min-h-[188px] flex-col rounded-3xl bg-surface p-5 text-left transition-colors hover:bg-accent',
        board.archived && 'opacity-55'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card">
          <ArrowUpRight className="size-4 transition-transform group-hover:rotate-45" />
        </span>
        {board.overdueCount > 0 && (
          <span className="rounded-full bg-destructive/12 px-2.5 py-0.5 text-[11.5px] font-medium text-destructive">
            {board.overdueCount} просрочено
          </span>
        )}
        {board.archived && <span className="rounded-full bg-card px-2.5 py-0.5 text-[11.5px]">Архив</span>}
      </div>
      <div className="font-display mt-4 line-clamp-2 text-[22px] leading-tight">{board.title}</div>
      {board.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{board.description}</p>}
      <div className="mt-auto pt-4">
        {board.tags.length > 0 && <TagList tags={board.tags} max={3} className="mb-3" />}
        <SegmentBar value={board.doneCount} total={Math.max(board.cardCount, 1)} segments={5} />
        <div className="mt-1.5 flex justify-between text-[11.5px] text-muted-foreground">
          <span>
            {board.cardCount
              ? `${open} ${plural(open, ['открытая', 'открытые', 'открытых'])} из ${board.cardCount}`
              : 'Пока без карточек'}
          </span>
          <span>{fmtRelative(board.updatedAt)}</span>
        </div>
      </div>
    </button>
  )
}

export function BoardsPage() {
  const { data: boards = [], isLoading } = useApi('boards', 'list')
  const [creating, setCreating] = useState(false)
  return (
    <Page>
      <PageHeader
        title="Доски"
        subtitle="Отдельная канбан-доска на каждый проект."
        actions={
          <Button variant="lime" onClick={() => setCreating(true)}>
            <Plus /> Новая доска
          </Button>
        }
      />
      <PageBody>
        {!isLoading && boards.length === 0 ? (
          <EmptyState
            icon={SquareKanban}
            title="Досок пока нет"
            hint="Создайте доску вручную или превратите идею в доску одной кнопкой."
            action={
              <Button variant="lime" onClick={() => setCreating(true)}>
                <Plus /> Новая доска
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {boards.map((b) => (
              <BoardTile key={b.id} board={b} />
            ))}
          </div>
        )}
      </PageBody>
      <CreateBoardDialog open={creating} onOpenChange={setCreating} />
    </Page>
  )
}
