/** General notes — everything that is not Claude-specific. Optional folders + global tags. */
import { useState } from 'react'
import { Folder, NotebookPen, Plus } from 'lucide-react'
import { noteInputSchema, type Note, type NotePatch } from '@shared/domain/notes'
import { limitsOf } from '@/lib/limits'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtRelative, mdPreview } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Field, FilterBar, FilterChips, NoResults, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { Combobox } from '@/components/common/combobox'
import { TagFilter, TagList } from '@/components/common/tags'
import { DetailPane, EntityAside, ListItem, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { AutoMarkdown, AutoTitle, EditorStack } from '../claude/editor-kit'
import { noResultsHint } from '../claude/chips'

const LIMITS = limitsOf(noteInputSchema)
const NEW_TITLE = 'Нова нотатка'

/** Filter key for notes without a folder (backend matches folder === ''). */
const NO_FOLDER = '__none__'

function NoteDetail({ note, onClose }: { note: Note; onClose: () => void }) {
  const update = useApiMutation('notes', 'update')
  const remove = useApiMutation('notes', 'remove', { successMessage: 'Нотатку переміщено в кошик' })
  const save = (patch: NotePatch): void => update.mutate({ id: note.id, patch })
  const entity = { type: 'note' as const, id: note.id }
  const { data: folders = [] } = useApi('notes', 'folders')
  // The note's own folder is always an option: otherwise the field could not show its name.
  const folderOptions = [...folders, ...(note.folder && !folders.includes(note.folder) ? [note.folder] : [])].map(
    (f) => ({ value: f, label: f })
  )
  const current = note.folder || null

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(note.id)
        onClose()
      }}
      aside={
        <EntityAside
          entity={entity}
          tags={note.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={note.createdAt}
          updatedAt={note.updatedAt}
        >
          {/* Reading a note without a folder: the field hides itself (Combobox → data-empty). */}
          <Field label="Тека">
            <Combobox
              value={current}
              options={folderOptions}
              icon={Folder}
              placeholder="Без теки"
              searchPlaceholder="Знайти або створити теку…"
              emptyText="Тек поки немає"
              creatable
              onCreate={(f) => save({ folder: f.slice(0, LIMITS.folder) })}
              maxLength={LIMITS.folder}
              clearable
              clearLabel="Без теки"
              onChange={(v) => v !== current && save({ folder: v ?? '' })}
            />
          </Field>
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle value={note.title} onSave={(title) => save({ title })} placeholder="Назва нотатки" maxLength={LIMITS.title} />
        <AutoMarkdown
          label="Текст"
          value={note.body}
          onSave={(body) => save({ body })}
          placeholder="Пишіть у Markdown: заголовки, списки, посилання, блоки коду"
          maxLength={LIMITS.body}
          minHeight="320px"
        />
      </EditorStack>
    </DetailPane>
  )
}

export function NotesPage() {
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [folder, setFolder] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const { data: folders = [] } = useApi('notes', 'folders')
  const q = useDebounced(search.trim())
  const list = useInfiniteApi('notes', 'list', {
    search: q || undefined,
    tagId,
    folder: folder === undefined ? undefined : folder === NO_FOLDER ? '' : folder
  })
  const { data: all = [] } = useApi('notes', 'list', {})
  const { data: openItem } = useApi('notes', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('notes', 'create')

  const countIn = (f: string): number => all.filter((n) => n.folder === f).length
  const unfiled = countIn('')
  const filtered = !!(search.trim() || tagId || folder)
  // The selected folder stays a chip even when it has just been emptied, so the active filter is visible.
  const folderChips = [
    ...folders.map((f) => ({ value: f, label: f, count: countIn(f) })),
    ...(folder && folder !== NO_FOLDER && !folders.includes(folder) ? [{ value: folder, label: folder, count: 0 }] : []),
    ...((folders.length && unfiled) || folder === NO_FOLDER ? [{ value: NO_FOLDER, label: 'Без теки', count: unfiled }] : [])
  ]

  const resetFilters = (): void => {
    setSearch('')
    setTagId(undefined)
    setFolder(undefined)
  }

  // The server reuses an untouched empty draft (SoftRepository.insert), so this never piles up blank notes.
  const createNew = async (): Promise<void> => {
    if (create.isPending) return
    try {
      const created = await create.mutateAsync({ title: NEW_TITLE, folder: folder && folder !== NO_FOLDER ? folder : '' })
      setOpen(created.id)
    } catch {
      // useApiMutation has already shown the error toast; there is nothing to open.
    }
  }

  return (
    <Page>
      <PageHeader
        title="Нотатки"
        subtitle="Усе, що не про Claude: домовленості, процеси, чернетки думок."
        actions={
          <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
            <Plus /> Нотатка
          </Button>
        }
      >
        <FilterBar
          chips={
            folderChips.length > 0 && (
              <FilterChips allLabel="Усі" value={folder} onChange={setFolder} options={folderChips} />
            )
          }
          trailing={
            <>
              <TagFilter value={tagId} onChange={setTagId} />
              <SearchInput value={search} onChange={setSearch} placeholder="Шукати в нотатках" />
            </>
          }
        />
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="-mx-1 px-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(x) => x.id}
              estimateSize={84}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={
                !list.isLoading &&
                (filtered ? (
                  <NoResults icon={NotebookPen} hint={noResultsHint(search, !!(tagId || folder))} onReset={resetFilters} />
                ) : (
                  <EmptyState
                    icon={NotebookPen}
                    title="Нотаток поки немає"
                    hint="Створіть першу нотатку — розкласти по теках можна потім."
                    cta={{ label: 'Створити нотатку', icon: Plus, onClick: () => void createNew() }}
                  />
                ))
              }
              renderItem={(n) => {
                const active = n.id === openId
                const text = mdPreview(n.body)
                return (
                  <ListItem active={active} onClick={() => setOpen(n.id)}>
                    <div className="truncate text-body font-medium">{n.title}</div>
                    {text && (
                      <div className={cn('mt-1 line-clamp-2 text-caption', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        {text}
                      </div>
                    )}
                    {/* One meta line: folder · tags … time (time never drops to its own row). */}
                    <div className="mt-2 flex min-w-0 items-center gap-1.5">
                      {n.folder && (
                        <Badge
                          variant="outline"
                          title={n.folder}
                          className={cn(
                            'h-5 max-w-40 min-w-0 shrink-0 justify-start',
                            active && 'border-ink-foreground/20 text-ink-foreground'
                          )}
                        >
                          {/* Badge centres and clips: the «…» needs its own truncating span. */}
                          <span className="truncate">{n.folder}</span>
                        </Badge>
                      )}
                      <div className="flex min-w-0 flex-1 overflow-hidden">
                        <TagList tags={n.tags} max={2} className="flex-nowrap" />
                      </div>
                      <span className={cn('ml-auto shrink-0 text-meta whitespace-nowrap', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        {fmtRelative(n.updatedAt)}
                      </span>
                    </div>
                  </ListItem>
                )
              }}
            />
          }
          detail={openItem ? <NoteDetail key={openItem.id} note={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
