/** General notes — everything that is not Claude-specific. Optional folders + global tags. */
import { useState } from 'react'
import { NotebookPen, Plus } from 'lucide-react'
import { noteInputSchema, type Note, type NotePatch } from '@shared/domain/notes'
import { limitsOf } from '@/lib/limits'

const LIMITS = limitsOf(noteInputSchema)
const NEW_TITLE = 'Нова нотатка'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualList } from '@/components/common/virtual-list'
import { fmtRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { DetailPane, EntityAside, ListItem, MasterDetail, SectionLabel, useOpenParam } from '@/components/common/master-detail'
import { AutoMarkdown, AutoTitle, EditorStack } from '../claude/editor-kit'
import { FolderPicker } from './folder-picker'

/** Filter key for notes without a folder (backend matches folder === ''). */
const NO_FOLDER = '__none__'

function excerpt(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~[\]()-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

function NoteDetail({ note, onClose }: { note: Note; onClose: () => void }) {
  const update = useApiMutation('notes', 'update')
  const remove = useApiMutation('notes', 'remove', { successMessage: 'Нотатку переміщено в кошик' })
  const save = (patch: NotePatch): void => update.mutate({ id: note.id, patch })
  const entity = { type: 'note' as const, id: note.id }

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
          <section className="flex flex-col gap-2">
            <SectionLabel>Тека</SectionLabel>
            <FolderPicker value={note.folder} onChange={(folder) => save({ folder })} />
          </section>
        </EntityAside>
      }
    >
      <EditorStack key={note.id}>
        <AutoTitle value={note.title} onSave={(title) => save({ title })} placeholder="Назва нотатки" maxLength={LIMITS.title} />
        <AutoMarkdown
          label="Текст"
          value={note.body}
          onSave={(body) => save({ body })}
          placeholder="Пишіть у Markdown: списки, посилання, ```код```"
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
  const filtered = !!(search || tagId || folder)

  return (
    <Page>
      <PageHeader
        title="Нотатки"
        subtitle="Усе, що не про Claude: домовленості, процеси, чернетки думок."
        actions={
          <Button
            variant="lime"
            onClick={async () => {
              // An untouched blank note already exists → open it instead of piling up empty ones.
              const blank = list.items.find((n) => n.title === NEW_TITLE && !n.body.trim())
              if (blank) return setOpen(blank.id)
              const created = await create.mutateAsync({
                title: NEW_TITLE,
                folder: folder && folder !== NO_FOLDER ? folder : ''
              })
              setOpen(created.id)
            }}
          >
            <Plus /> Нотатка
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Усі"
            value={folder}
            onChange={setFolder}
            options={[
              ...folders.map((f) => ({ value: f, label: f, count: countIn(f) })),
              ...(folders.length && unfiled ? [{ value: NO_FOLDER, label: 'Без теки', count: unfiled }] : [])
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Шукати в нотатках" className="w-64" />
          </div>
        </div>
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
              empty={!list.isLoading && (<EmptyState
                  icon={NotebookPen}
                  title={filtered ? 'Нічого не знайшлося' : 'Нотаток поки немає'}
                  hint={
                    filtered
                      ? 'Пошук іде за назвою й текстом нотаток.'
                      : 'Створіть першу нотатку — розкласти по теках можна потім.'
                  }
                />)}
              renderItem={(n) => {
                const active = n.id === openId
                const text = excerpt(n.body)
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
                          className={cn('h-5 max-w-40 shrink-0 truncate', active && 'border-ink-foreground/20 text-ink-foreground')}
                        >
                          {n.folder}
                        </Badge>
                      )}
                      {!active && (
                        <div className="flex min-w-0 flex-1 overflow-hidden">
                          <TagList tags={n.tags} max={2} className="flex-nowrap" />
                        </div>
                      )}
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
