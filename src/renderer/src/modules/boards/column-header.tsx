import { useRef, useState } from 'react'
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
import { Field } from '@/components/common/page'
import { useRepeatToast } from './repeat'

/** Column title with rename / "done column" toggle / delete (with choice where cards go). */
export function ColumnHeader({ column, count, columns }: { column: BoardColumn; count: number; columns: BoardColumn[] }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(column.title)
  const [deleting, setDeleting] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const others = columns.filter((c) => c.id !== column.id)
  const [target, setTarget] = useState('')
  // Computed on render: a column added after mount, or the chosen one deleted meanwhile, can't leave a stale target.
  const moveTo = others.some((c) => c.id === target) ? target : (others[0]?.id ?? '')
  const update = useApiMutation('boards', 'updateColumn')
  const notifyRepeat = useRepeatToast()
  const remove = useApiMutation('boards', 'removeColumn', {
    successMessage: 'Колонку видалено',
    onSuccess: notifyRepeat
  })

  const removeColumn = (moveCardsTo: string | null): void => {
    remove.mutate({ id: column.id, moveCardsTo })
    setDeleting(false)
  }

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
            Картки тут — виконані
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 /> Видалити колонку
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent
          className="rounded-3xl sm:max-w-md"
          // Focus on the safe choice: Enter right after opening must not delete the column.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            cancelRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>Видалити колонку «{column.title}»?</DialogTitle>
            <DialogDescription>
              {count
                ? others.length > 0
                  ? `У колонці ${count} ${plural(count, ['картка', 'картки', 'карток'])}. Перенесіть їх в іншу колонку або відправте в кошик разом із колонкою.`
                  : `У колонці ${count} ${plural(count, ['картка', 'картки', 'карток'])} — ${plural(count, ['вона піде', 'вони підуть', 'вони підуть'])} у кошик разом із колонкою.`
                : 'Колонка порожня.'}
            </DialogDescription>
          </DialogHeader>
          {count > 0 && others.length > 0 && (
            <Field label="Куди перенести картки">
              <Select value={moveTo} onValueChange={setTarget}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {others.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <DialogFooter className="gap-2">
            <Button ref={cancelRef} variant="soft" onClick={() => setDeleting(false)}>
              Скасувати
            </Button>
            {count > 0 && moveTo ? (
              <>
                {/* The safe choice is the main button; losing the cards is the red one. */}
                <Button variant="destructive" onClick={() => removeColumn(null)}>
                  <Trash2 /> Видалити разом із картками
                </Button>
                <Button variant="default" onClick={() => removeColumn(moveTo)}>
                  Перенести й видалити
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => removeColumn(null)}>
                <Trash2 /> Видалити
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
