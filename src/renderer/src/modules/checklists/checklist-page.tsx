import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowLeft, ArrowUpRight, Plus, RotateCcw, Rocket, X, SearchX } from 'lucide-react'
import { checklistInputSchema, type ChecklistPatch } from '@shared/domain/checklists'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { EmptyState } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'
import {
  EntityAside,
  InlineTitle,
  RecordActions,
  SectionLabel
} from '@/components/common/master-detail'
import { RecordMode, useRecordMode } from '@/components/common/detail-mode'
import { RECORD_PAGE } from '@/components/common/record-page-layout'
import { CopyJsonButton } from '@/components/common/import-dialog'
import { MarkdownField } from '@/components/common/markdown'
import { Confirm } from '@/components/common/confirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LaunchDialog } from './launch-dialog'
import { ItemRow } from './item-row'
import { AddItem } from './add-item'
import { SectionTitle } from './section-title'
import { RunProgress } from './run-progress'
import { ITEM_LIMITS, NO_SECTION, useChecklistOrder } from './use-checklist-order'

const LIMITS = limitsOf(checklistInputSchema)

/** Keyed by id: switching to another checklist (e.g. «Відкрити вихідний шаблон») starts with fresh state. */
export function ChecklistPage(): ReactElement {
  const { id = '' } = useParams()
  return <ChecklistView key={id} id={id} />
}

function ChecklistView({ id }: { id: string }): ReactElement {
  const navigate = useNavigate()
  const { data, isLoading } = useApi('checklists', 'get', id)
  const update = useApiMutation('checklists', 'update')
  const reset = useApiMutation('checklists', 'reset', { successMessage: 'Позначки знято' })
  const listPath = data?.kind === 'run' ? '/checklists?tab=runs' : '/checklists'
  // Closing is async (Esc on a fresh draft reverts and deletes it first): if the person has gone elsewhere
  // meanwhile (sidebar, Ctrl+K), don't pull them back to the list.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const toList = (): void => {
    if (mounted.current) void navigate(listPath)
  }
  const remove = useApiMutation('checklists', 'remove', {
    successMessage: 'Чек-лист переміщено в кошик',
    onSuccess: toList
  })
  const [launchOpen, setLaunchOpen] = useState(false)
  const patch = (p: ChecklistPatch): void => update.mutate({ id, patch: p })
  const [title, setTitle] = useAutosave(
    data?.title ?? '',
    (t) => t.trim() && patch({ title: t.trim() })
  )
  const [description, setDescription] = useAutosave(data?.description ?? '', (d) =>
    patch({ description: d })
  )
  const mode = useRecordMode(id, 'checklist')
  const { items, groups, sensors, onDragEnd } = useChecklistOrder(id, data?.items)
  const [draftSections, setDraftSections] = useState<string[]>([])
  const [sectionName, setSectionName] = useState('')
  const firstItem = useRef<HTMLInputElement>(null)
  const focusFirstItem = (): void => {
    requestAnimationFrame(() => {
      firstItem.current?.focus()
      firstItem.current?.scrollIntoView({ block: 'center' })
    })
  }
  /** «Додати пункти» while reading: the add field exists only in edit mode, so switch first, then focus it. */
  const startAdding = (): void => {
    mode.setEditing(true)
    focusFirstItem()
  }
  // «Додати пункти» on a list tile comes here as ?add=1: straight to the add field, not a second click.
  // The URL is the one-shot flag — switched to editing during render, dropped once the field is shown.
  const [params, setParams] = useSearchParams()
  const addOnOpen = params.get('add') === '1'
  if (addOnOpen && data && !mode.editing) mode.setEditing(true)
  useEffect(() => {
    if (!addOnOpen || !mode.editing) return
    setParams({}, { replace: true })
    focusFirstItem()
  }, [addOnOpen, mode.editing, setParams])

  if (isLoading) return <PageSkeleton kind="detail" />
  if (!data) {
    return (
      <EmptyState
        icon={SearchX}
        title="Чек-лист не знайдено"
        hint="Можливо, він у кошику."
        cta={{ label: 'До чек-листів', onClick: () => navigate('/checklists') }}
      />
    )
  }

  const isRun = data.kind === 'run'
  const empty = items.length === 0

  return (
    <RecordMode mode={mode}>
      <div className={RECORD_PAGE.container}>
        <div className={RECORD_PAGE.row}>
          <div className={RECORD_PAGE.body}>
            {/* Actions get their own row in the DS §8 order (RecordActions); the title below takes the whole column. */}
            <div className="mb-4 flex items-center gap-4">
              <Button
                variant="link"
                asChild
                className="flex w-fit shrink-0 text-caption text-muted-foreground no-underline hover:text-foreground hover:underline"
              >
                <Link to={listPath}>
                  <ArrowLeft className="size-3.5" /> {isRun ? 'Прогони' : 'Чек-листи'}
                </Link>
              </Button>
              <RecordActions
                className="flex-1"
                entity={{ type: 'checklist', id }}
                mode={mode}
                extra={
                  <>
                    <Badge variant="outline">{isRun ? 'Прогін' : 'Шаблон'}</Badge>
                    {isRun ? (
                      <Confirm
                        title="Зняти всі позначки?"
                        description="Усі пункти знову стануть невиконаними."
                        confirmLabel="Скинути"
                        onConfirm={() => reset.mutate(id)}
                      >
                        <Button variant="soft">
                          <RotateCcw /> Скинути
                        </Button>
                      </Confirm>
                    ) : empty ? (
                      // A run of an empty template would be «0 з 0»: say what to do first.
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="rounded-full">
                            <Button variant="lime" disabled>
                              <Rocket /> Запустити прогін
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Спершу додайте пункти: «Редагувати» або E</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button variant="lime" onClick={() => setLaunchOpen(true)}>
                        <Rocket /> Запустити прогін
                      </Button>
                    )}
                    <CopyJsonButton
                      what="Чек-лист"
                      getData={() => ({
                        title: data.title,
                        description: data.description,
                        sections: groups.map(([section, list]) => ({
                          title: section,
                          items: list.map((i) => (i.hint ? { text: i.text, hint: i.hint } : i.text))
                        }))
                      })}
                    />
                  </>
                }
                onDelete={() => remove.mutate(id)}
                onClose={toList}
              />
            </div>

            <InlineTitle value={title} onChange={setTitle} maxLength={LIMITS.title} />

            {isRun && <RunProgress items={items} />}

            {/* A readable line length in both modes, so E doesn't change the width. */}
            <div className="mt-5 max-w-[72ch]">
              <MarkdownField
                label={isRun ? 'Нотатки' : 'Опис'}
                value={description}
                onChange={setDescription}
                placeholder={
                  isRun
                    ? 'Що важливо саме цього разу: версія, середовище, хто перевіряє'
                    : 'Коли й навіщо використовувати цей чек-лист'
                }
                maxLength={LIMITS.description}
                minHeight="100px"
              />
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="mt-8 flex flex-col gap-7">
                  {groups.map(([section, list]) => (
                    <section key={section || NO_SECTION}>
                      <div className="mb-1.5 flex items-baseline justify-between px-2">
                        <SectionTitle section={section} items={list} />
                        {isRun && (
                          <span className="text-caption text-muted-foreground tabular-nums">
                            {list.filter((i) => i.done).length} з {list.length}
                          </span>
                        )}
                      </div>
                      <ul className="flex flex-col">
                        {list.map((item) => (
                          <ItemRow key={item.id} item={item} isRun={isRun} />
                        ))}
                      </ul>
                      <AddItem checklistId={id} section={section} />
                    </section>
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Empty checklist: what it's for, then a field for the first item; while reading — a way to get there. */}
            {groups.length === 0 && draftSections.length === 0 && (
              <div className="flex flex-col items-start gap-2">
                {(!isRun || !mode.editing) && (
                  <p className="text-body text-muted-foreground">
                    {isRun
                      ? 'Пунктів поки немає.'
                      : 'Додайте кроки, які повторюєте щоразу, — потім запускайте прогін.'}
                  </p>
                )}
                {!mode.editing && (
                  <Button variant="soft" size="sm" onClick={startAdding}>
                    <Plus /> Додати пункти
                  </Button>
                )}
                <AddItem checklistId={id} section="" inputRef={firstItem} />
              </div>
            )}
            {draftSections
              .filter((name) => !groups.some(([s]) => s === name))
              .map((name) => (
                <section key={`draft-${name}`} data-edit-only className="mt-7">
                  <div className="mb-1.5 flex items-center justify-between px-2">
                    {/* Renamable like any section; an empty name or one taken by another section changes nothing. */}
                    <SectionTitle
                      section={name}
                      onRename={(next) =>
                        next &&
                        !groups.some(([s]) => s === next) &&
                        !draftSections.includes(next) &&
                        setDraftSections((d) => d.map((x) => (x === name ? next : x)))
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Прибрати розділ ${name}`}
                      onClick={() => setDraftSections((d) => d.filter((x) => x !== name))}
                    >
                      <X />
                    </Button>
                  </div>
                  <AddItem checklistId={id} section={name} />
                </section>
              ))}
            <form
              data-edit-only
              className="mt-6 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const name = sectionName.trim()
                if (!name) return
                if (!groups.some(([s]) => s === name) && !draftSections.includes(name))
                  setDraftSections((d) => [...d, name])
                setSectionName('')
              }}
            >
              <Input
                value={sectionName}
                maxLength={ITEM_LIMITS.section}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="Напр.: Перед релізом"
                className="max-w-sm"
                aria-label="Назва нового розділу"
              />
              <Button type="submit" variant="soft" disabled={!sectionName.trim()}>
                <Plus /> Додати розділ
              </Button>
            </form>
          </div>

          <aside className={RECORD_PAGE.aside}>
            <EntityAside
              entity={{ type: 'checklist', id: data.id }}
              tags={data.tags}
              onTagsChange={(tagIds) => patch({ tagIds })}
              createdAt={data.createdAt}
              updatedAt={data.updatedAt}
            >
              {isRun && data.templateId && (
                <SectionLabel
                  action={
                    <Button variant="outline" size="xs" asChild>
                      <Link to={`/checklists/${data.templateId}`}>
                        <ArrowUpRight /> Відкрити вихідний шаблон
                      </Link>
                    </Button>
                  }
                >
                  Шаблон
                </SectionLabel>
              )}
            </EntityAside>
          </aside>
          <LaunchDialog
            template={isRun ? null : { id: data.id, title: data.title }}
            open={launchOpen}
            onOpenChange={setLaunchOpen}
          />
        </div>
      </div>
    </RecordMode>
  )
}
