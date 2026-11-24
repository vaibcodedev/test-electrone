/** General notes — everything that is not Claude-specific. Optional folders + global tags. */
import { useState } from 'react'
import { NotebookPen, Plus } from 'lucide-react'
import type { Note, NotePatch } from '@shared/domain/notes'
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
import { AutoMarkdown, AutoTitle, EditorStack, useEscapeToClose } from '../claude/editor-kit'
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
  const remove = useApiMutation('notes', 'remove', { successMessage: 'Заметка в корзине' })
  const save = (patch: NotePatch): void => update.mutate({ id: note.id, patch })
  const entity = { type: 'note' as const, id: note.id }
  useEscapeToClose(onClose)

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
            <SectionLabel>Папка</SectionLabel>
            <FolderPicker value={note.folder} onChange={(folder) => save({ folder })} />
          </section>
        </EntityAside>
      }
    >
      <EditorStack key={note.id}>
        <AutoTitle value={note.title} onSave={(title) => save({ title })} placeholder="Название заметки" />
        <AutoMarkdown
          label="Текст"
          value={note.body}
          onSave={(body) => save({ body })}
          placeholder="Пишите в Markdown: списки, ссылки, ```код```"
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
        title="Заметки"
        subtitle="Всё, что не про Claude: договорённости, процессы, черновики мыслей."
        actions={
          <Button
            variant="lime"
            onClick={async () => {
              const created = await create.mutateAsync({
                title: 'Новая заметка',
                folder: folder && folder !== NO_FOLDER ? folder : ''
              })
              setOpen(created.id)
            }}
          >
            <Plus /> Заметка
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Все"
            value={folder}
            onChange={setFolder}
            options={[
              ...folders.map((f) => ({ value: f, label: f, count: countIn(f) })),
              ...(folders.length && unfiled ? [{ value: NO_FOLDER, label: 'Без папки', count: unfiled }] : [])
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Искать в заметках" className="w-64" />
          </div>
        </div>
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualList
              className="-mx-1 px-1"
              items={list.items}
              getKey={(x) => x.id}
              estimateSize={84}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              empty={!list.isLoading && (<EmptyState
                  icon={NotebookPen}
                  title={filtered ? 'Ничего не нашлось' : 'Заметок пока нет'}
                  hint={
                    filtered
                      ? 'Поиск идёт по названию и тексту заметок.'
                      : 'Создайте первую заметку — разложить по папкам можно потом.'
                  }
                />)}
              renderItem={(n) => {
                const active = n.id === openId
                const text = excerpt(n.body)
                return (
                  <ListItem active={active} onClick={() => setOpen(n.id)}>
                    <div className="truncate text-[13.5px] font-medium">{n.title}</div>
                    {text && (
                      <div className={cn('mt-1 line-clamp-2 text-[12px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        {text}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {n.folder && (
                        <Badge variant={active ? 'lime' : 'outline'} className="h-5">
                          {n.folder}
                        </Badge>
                      )}
                      {!active && <TagList tags={n.tags} max={3} />}
                      <span className={cn('ml-auto text-[11px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                        {fmtRelative(n.updatedAt)}
                      </span>
                    </div>
                  </ListItem>
                )
              }}
            />
          }
          detail={openItem ? <NoteDetail note={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
