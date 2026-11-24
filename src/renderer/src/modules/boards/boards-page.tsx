import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowUpRight, Plus, SquareKanban } from 'lucide-react'
import type { BoardSummary } from '@shared/domain/boards'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtRelative, mdPreview } from '@/lib/format'
import { EmptyState, Field, Page, PageBody, PageHeader, SegmentBar } from '@/components/common/page'
import { TagList } from '@/components/common/tags'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'

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
          className="flex flex-col gap-4"
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
  return (
    <Card
      className={cn(
        'group relative min-h-[188px] gap-0 p-5 transition-colors focus-within:ring-[3px] focus-within:ring-ring/40 hover:bg-accent',
        board.archived && 'opacity-55'
      )}
    >
      <Link to={`/boards/${board.id}`} className="absolute inset-0 rounded-3xl outline-none" aria-label={board.title} />
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card">
          <ArrowUpRight className="size-4 transition-transform group-hover:rotate-45" />
        </span>
        <div className="flex gap-1">
          {board.overdueCount > 0 && <Badge variant="destructive">{board.overdueCount} просрочено</Badge>}
          {board.archived && <Badge variant="outline">Архив</Badge>}
        </div>
      </div>
      <CardTitle className="font-display mt-4 line-clamp-2 text-stat-sm leading-tight font-normal text-foreground">
        {board.title}
      </CardTitle>
      {board.description && (
        <CardDescription className="mt-1 line-clamp-2 text-caption">{mdPreview(board.description)}</CardDescription>
      )}
      <div className="mt-auto pt-4">
        {board.tags.length > 0 && <TagList tags={board.tags} max={3} className="relative mb-3" />}
        {/* One segment per card (up to 8), so the bar reads as "how many are done". */}
        {board.cardCount > 0 && (
          <SegmentBar value={board.doneCount} total={board.cardCount} segments={Math.min(board.cardCount, 8)} />
        )}
        <div className="mt-1.5 flex justify-between gap-3 text-meta text-muted-foreground">
          <span className="min-w-0 truncate">
            {board.cardCount
              ? `Готово ${board.doneCount} из ${board.cardCount}`
              : 'Пока без карточек'}
          </span>
          <span className="shrink-0">{fmtRelative(board.updatedAt)}</span>
        </div>
      </div>
    </Card>
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
