import { useId, type ReactElement } from 'react'
import { ExternalLink, Star } from 'lucide-react'
import {
  BOOKMARK_KINDS,
  BOOKMARK_STATUSES,
  bookmarkInputSchema,
  type Bookmark,
  type BookmarkKind,
  type BookmarkPatch,
  type BookmarkStatus
} from '@shared/domain/bookmarks'
import { openUrl } from '@/lib/open-url'
import { useApiMutation } from '@/lib/query'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isLikelyUrl, limitsOf } from '@/lib/limits'
import { useAutosave } from '@/hooks/use-autosave'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Field, Segmented } from '@/components/common/page'
import { LinkInput } from '@/components/common/text-field'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { DetailPane, EntityAside } from '@/components/common/master-detail'
import { AutoMarkdown, AutoTitle, EditorStack } from '../claude/editor-kit'
import { KIND_ICON, KIND_LABEL, STATUS_LABEL } from './labels'

const LIMITS = limitsOf(bookmarkInputSchema)

const isUrl = (v: string): boolean => !!v.trim() && isLikelyUrl(v)

function ProgressSlider({ value, onSave }: { value: number; onSave: (value: number) => void }): ReactElement {
  const [draft, setDraft] = useAutosave(value, onSave, 400)
  return (
    <div className="flex h-9 items-center gap-3">
      <Slider min={0} max={100} step={5} value={[draft]} onValueChange={([v]) => setDraft(v)} aria-label="Прогрес" className="flex-1" />
      <span className="w-10 text-right text-body tabular-nums">{draft}%</span>
    </div>
  )
}

function Rating({ value, onChange }: { value: number; onChange: (value: number) => void }): ReactElement {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      spacing={0.5}
      aria-label="Оцінка"
      value={value ? String(value) : ''}
      onValueChange={(v) => onChange(v ? Number(v) : 0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <ToggleGroupItem
          key={n}
          value={String(n)}
          aria-label={`${n} з 5`}
          title={`${n} з 5`}
          className="size-8 min-w-8 px-0 on:bg-transparent"
        >
          {/* Same warm star as the list row: lime stays the screen's one accent. */}
          <Star className={cn(n <= value ? 'fill-warn text-warn' : 'text-muted-foreground')} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * Progress and rating. Editing: slider and stars. Reading: a bar with «Готово N%» and «★ N з 5»; a value
 * that isn't there yet (0) is not shown, and neither is the row when both are empty.
 */
function ProgressAndRating({ item, onSave }: { item: Bookmark; onSave: (patch: BookmarkPatch) => void }): ReactElement | null {
  const readOnly = useReadOnly()
  if (readOnly) {
    if (!item.progress && !item.rating) return null
    return (
      <div className="grid grid-cols-2 gap-6">
        {item.progress > 0 && (
          <Field label="Прогрес">
            <div className="flex h-9 items-center gap-3">
              <Progress value={item.progress} aria-label="Прогрес" className="h-1.5 flex-1" />
              <span className="shrink-0 text-caption text-muted-foreground tabular-nums">Готово {item.progress}%</span>
            </div>
          </Field>
        )}
        {item.rating > 0 && (
          <Field label="Оцінка">
            <span className="flex h-9 items-center gap-1.5 text-body tabular-nums">
              <Star className="size-4 fill-warn text-warn" aria-hidden />
              {item.rating} з 5
            </span>
          </Field>
        )}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-6">
      <Field label="Прогрес">
        <ProgressSlider
          value={item.progress}
          onSave={(progress) =>
            onSave(progress > 0 && item.status === 'queue' ? { progress, status: 'in_progress' } : { progress })
          }
        />
      </Field>
      <Field label="Оцінка">
        <Rating value={item.rating} onChange={(rating) => onSave({ rating })} />
      </Field>
    </div>
  )
}

export function BookmarkDetail({ item, onClose }: { item: Bookmark; onClose: () => void }): ReactElement {
  const update = useApiMutation('bookmarks', 'update')
  const remove = useApiMutation('bookmarks', 'remove', { successMessage: 'Переміщено в кошик' })
  const save = (patch: BookmarkPatch): void => update.mutate({ id: item.id, patch })
  const entity = { type: 'bookmark' as const, id: item.id }
  const kindId = useId()

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(item.id)
        onClose()
      }}
      headerExtra={
        isUrl(item.url) && (
          <Button variant="soft" size="sm" onClick={() => openUrl(item.url)}>
            <ExternalLink /> Відкрити
          </Button>
        )
      }
      aside={
        <EntityAside
          entity={entity}
          tags={item.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={item.createdAt}
          updatedAt={item.updatedAt}
        >
          {/* Six kinds don't fit a segment in the narrow column: a select. */}
          <Field label="Тип" htmlFor={kindId}>
            <Select value={item.kind} onValueChange={(kind) => save({ kind: kind as BookmarkKind })}>
              <SelectTrigger id={kindId} size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOKMARK_KINDS.map((k) => {
                  const Icon = KIND_ICON[k]
                  return (
                    <SelectItem key={k} value={k}>
                      <Icon /> {KIND_LABEL[k]}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </Field>
          {item.finishedAt && <p className="text-caption text-muted-foreground">Завершено {fmtDate(item.finishedAt)}</p>}
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle value={item.title} onSave={(title) => save({ title })} maxLength={LIMITS.title} />
        <LinkInput label="Посилання" value={item.url} onSave={(url) => save({ url })} maxLength={LIMITS.url} />
        <Field label="Статус">
          <Segmented<BookmarkStatus>
            options={BOOKMARK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            value={item.status}
            onChange={(status) => save({ status })}
          />
        </Field>
        <ProgressAndRating item={item} onSave={save} />
        <AutoMarkdown
          label="Нотатки"
          value={item.notes}
          onSave={(notes) => save({ notes })}
          placeholder="Головні думки, цитати, що застосувати"
          maxLength={LIMITS.notes}
        />
      </EditorStack>
    </DetailPane>
  )
}
