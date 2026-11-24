import { useState } from 'react'
import { MAX } from '@shared/domain/limits'
import { Check, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { BoardColumn } from '@shared/domain/boards'
import { useApiMutation } from '@/lib/query'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { plural } from '@/lib/format'

/** Column title with rename / "done column" toggle / delete (with choice where cards go). */
export function ColumnHeader({ column, count, columns }: { column: BoardColumn; count: number; columns: BoardColumn[] }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(column.title)
  const [deleting, setDeleting] = useState(false)
  const others = columns.filter((c) => c.id !== column.id)
  const [target, setTarget] = useState<string>(others[0]?.id ?? '')
  const update = useApiMutation('boards', 'updateColumn')
  const remove = useApiMutation('boards', 'removeColumn', { successMessage: 'Колонку видалено' })

  const commit = (): void => {
    setEditing(false)
    if (title.trim() && title.trim() !== column.title) update.mutate({ id: column.id, patch: { title: title.trim() } })
    else setTitle(column.title)
  }

  return (
    <div className="flex h-9 items-center gap-2 px-2">
      {editing ? (
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setTitle(column.title)
              setEditing(false)
            }
          }}
          maxLength={MAX.label}
          aria-label="Назва колонки"
          className="h-7 min-w-0 flex-1 rounded-lg bg-card px-2 text-body font-medium"
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 justify-start gap-2 px-1 text-body hover:bg-transparent"
          title="Подвійний клік — перейменувати"
        >
          {column.isDone && (
            <Badge variant="lime" className="size-4 p-0" aria-label="Колонка готових">
              <Check className="size-2.5" />
            </Badge>
          )}
          <span className="truncate">{column.title}</span>
          <span className="text-caption font-normal text-muted-foreground tabular-nums">{count}</span>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 text-muted-foreground hover:bg-card hover:text-foreground"
            aria-label="Меню колонки"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-2xl">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Перейменувати
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem
            checked={column.isDone}
            onCheckedChange={(isDone) => update.mutate({ id: column.id, patch: { isDone: !!isDone } })}
          >
            Колонка готових
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 /> Видалити колонку
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Видалити колонку «{column.title}»?</DialogTitle>
            <DialogDescription>
              {count
                ? `У колонці ${count} ${plural(count, ['картка', 'картки', 'карток'])}. Перенесіть їх в іншу колонку або відправте в кошик разом із колонкою.`
                : 'Колонка порожня.'}
            </DialogDescription>
          </DialogHeader>
          {count > 0 && others.length > 0 && (
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Куди перенести картки" />
              </SelectTrigger>
              <SelectContent>
                {others.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter className="gap-2">
            {count > 0 && (
              <Button
                variant="soft"
                onClick={() => {
                  remove.mutate({ id: column.id, moveCardsTo: null })
                  setDeleting(false)
                }}
              >
                Видалити з картками
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => {
                remove.mutate({ id: column.id, moveCardsTo: count && target ? target : null })
                setDeleting(false)
              }}
            >
              {count && others.length ? 'Перенести й видалити' : 'Видалити'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
