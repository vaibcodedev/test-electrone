import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { PRIORITIES, type BoardColumn, type CardDetails, type CardPatch, type ChecklistEntry, type Priority } from '@shared/domain/boards'
import { useApi, useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDateTime } from '@/lib/format'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { DatePicker } from '@/components/common/date-picker'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MarkdownField } from '@/components/common/markdown'
import { Field, SegmentBar } from '@/components/common/page'
import { TagPicker } from '@/components/common/tags'
import { LinksPanel } from '@/components/common/links-panel'
import { PinButtons } from '@/components/common/pin-buttons'
import { AttachmentsPanel } from '@/components/common/attachments'
import { cn } from '@/lib/utils'
import { PRIORITY_DOT, PRIORITY_LABEL } from './labels'

function ChecklistRow({ entry }: { entry: ChecklistEntry }) {
  const update = useApiMutation('cards', 'updateCheck')
  const remove = useApiMutation('cards', 'removeCheck')
  const [text, setText] = useAutosave(entry.text, (t) => t.trim() && update.mutate({ id: entry.id, text: t.trim() }))
  return (
    <li className="group flex items-center gap-2.5 rounded-xl px-2 py-1 hover:bg-surface">
      <Checkbox
        checked={entry.done}
        onCheckedChange={(done) => update.mutate({ id: entry.id, done: !!done })}
        aria-label={entry.text}
      />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Текст пункта"
        className={cn(
          'h-8 min-w-0 flex-1 bg-transparent px-1 focus-visible:bg-card',
          entry.done && 'text-muted-foreground line-through'
        )}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => remove.mutate(entry.id)}
        className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
        aria-label="Удалить пункт"
      >
        <X />
      </Button>
    </li>
  )
}

function Checklist({ card }: { card: CardDetails }) {
  const [text, setText] = useState('')
  const add = useApiMutation('cards', 'addCheck')
  const done = card.checklist.filter((c) => c.done).length
  return (
    <section className="flex flex-col gap-2">
      <div>
        <SectionLabel
          action={
            card.checklist.length > 0 && (
              <span className="text-caption text-muted-foreground tabular-nums">
                {done}/{card.checklist.length}
              </span>
            )
          }
        >
          Чек-лист
        </SectionLabel>
      </div>
      {card.checklist.length > 0 && <SegmentBar value={done} total={card.checklist.length} segments={card.checklist.length > 8 ? 8 : card.checklist.length} />}
      <ul className="-mx-2 flex flex-col">
        {card.checklist.map((e) => (
          <ChecklistRow key={e.id} entry={e} />
        ))}
      </ul>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          add.mutate({ cardId: card.id, text: text.trim() })
          setText('')
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Добавить пункт" />
        <Button type="submit" variant="soft" size="icon" disabled={!text.trim()} aria-label="Добавить пункт">
          <Plus />
        </Button>
      </form>
    </section>
  )
}

function CardEditor({ card, columns, onClose }: { card: CardDetails; columns: BoardColumn[]; onClose: () => void }) {
  const update = useApiMutation('cards', 'update')
  const remove = useApiMutation('cards', 'remove', {
    onSuccess: () => {
      toast.success('Карточка в корзине')
      onClose()
    }
  })
  const patch = (p: CardPatch): void => update.mutate({ id: card.id, patch: p })
  const [title, setTitle] = useAutosave(card.title, (t) => t.trim() && patch({ title: t.trim() }))
  const [description, setDescription] = useAutosave(card.description, (d) => patch({ description: d }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <PinButtons entity={{ type: 'card', id: card.id }} />
        <span className="flex-1 truncate text-caption text-muted-foreground">
          {card.boardTitle} · {card.columnTitle}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="В корзину" onClick={() => remove.mutate(card.id)}>
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>В корзину</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Закрыть" onClick={onClose}>
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Закрыть · Esc</TooltipContent>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <SheetTitle className="sr-only">{card.title}</SheetTitle>
        <SheetDescription className="sr-only">Редактирование карточки</SheetDescription>
        <InlineTitle value={title} onChange={setTitle} placeholder="Название карточки" className="text-[24px]" />

        <div className="mt-5 grid grid-cols-2 gap-4">
          <Field label="Колонка">
            <Select value={card.columnId} onValueChange={(columnId) => patch({ columnId })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Приоритет">
            <Select value={card.priority} onValueChange={(v) => patch({ priority: v as Priority })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className={cn('size-2 rounded-full', PRIORITY_DOT[p])} />
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Дедлайн" className="col-span-2">
            <DatePicker withTime value={card.dueAt} onChange={(dueAt) => patch({ dueAt })} placeholder="Без дедлайна" />
          </Field>
        </div>

        <section className="mt-5 flex flex-col gap-2">
          <SectionLabel>Метки</SectionLabel>
          <TagPicker value={card.tags} onChange={(tagIds) => patch({ tagIds })} />
        </section>

        <section className="mt-5">
          <MarkdownField
            label="Описание"
            value={description}
            onChange={setDescription}
            placeholder="Описание, ссылки, детали…"
            minHeight="160px"
          />
        </section>

        <div className="mt-6">
          <Checklist card={card} />
        </div>

        <div className="mt-6 flex flex-col gap-6">
          <LinksPanel entity={{ type: 'card', id: card.id }} />
          <AttachmentsPanel entity={{ type: 'card', id: card.id }} />
          <div className="text-meta text-muted-foreground">
            Создано {fmtDateTime(card.createdAt)}
            {card.completedAt && ` · выполнено ${fmtDateTime(card.completedAt)}`}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Right-side card editor, opened by ?card=<id>. */
export function CardSheet({ cardId, columns, onClose }: { cardId: string | null; columns: BoardColumn[]; onClose: () => void }) {
  const { data: card } = useApi('cards', 'get', cardId ?? '', { enabled: !!cardId })
  return (
    <Sheet open={!!cardId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-[560px]">
        {card && card.id === cardId ? (
          <CardEditor key={card.id} card={card} columns={columns} onClose={onClose} />
        ) : (
          <>
            <SheetTitle className="sr-only">Карточка</SheetTitle>
            <SheetDescription className="sr-only">Загрузка</SheetDescription>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
