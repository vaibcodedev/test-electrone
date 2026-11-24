import { useMemo, useState } from 'react'
import { BookOpen, GitBranch, Package, Plus } from 'lucide-react'
import { LIBRARY_STATUSES, type Library, type LibraryPatch, type LibraryStatus } from '@shared/domain/libraries'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { CopyButton } from '@/components/common/copy-button'
import { DetailPane, EntityAside, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import {
  AutoMarkdown,
  AutoTextarea,
  AutoTitle,
  Block,
  EditorStack,
  InputField,
  PillSelect,
  countBy,
  useEscapeToClose
} from '../claude/editor-kit'

const STATUS_LABEL: Record<LibraryStatus, string> = {
  used: 'Использую',
  favorite: 'Любимая',
  want: 'Хочу попробовать',
  testing: 'Пробую',
  dropped: 'Не зашла'
}

const STATUS_DOT: Record<LibraryStatus, string> = {
  used: 'bg-success',
  favorite: 'bg-lime',
  want: 'bg-info',
  testing: 'bg-warn',
  dropped: 'bg-muted-foreground'
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/** Opens npm / GitHub / docs in the system browser. */
function LinkButtons({ lib, onInk }: { lib: Library; onInk?: boolean }) {
  const links = [
    { url: lib.npmUrl, label: 'npm', icon: Package },
    { url: lib.githubUrl, label: 'GitHub', icon: GitBranch },
    { url: lib.docsUrl, label: 'Доки', icon: BookOpen }
  ].filter((l) => isUrl(l.url))
  if (!links.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {links.map((l) => (
        <Button
          key={l.label}
          variant="soft"
          size="xs"
          className={cn('h-7 px-2.5 font-normal', onInk ? 'bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/20' : 'bg-card')}
          onClick={(e) => {
            e.stopPropagation()
            void api.app.openExternal(l.url)
          }}
        >
          <l.icon />
          {l.label}
        </Button>
      ))}
    </div>
  )
}

/** Install command as a read-only shadcn InputGroup with copy. */
function InstallCommand({ cmd, onInk }: { cmd: string; onInk?: boolean }) {
  if (!cmd.trim()) return null
  return (
    <InputGroup
      onClick={(e) => e.stopPropagation()}
      className={cn('h-8 font-mono', onInk ? 'bg-ink-foreground/8 text-ink-foreground' : 'bg-card')}
    >
      <InputGroupAddon className={cn('font-mono', onInk ? 'text-ink-accent' : 'text-muted-foreground')}>$</InputGroupAddon>
      <InputGroupInput readOnly value={cmd} aria-label="Команда установки" className="font-mono text-[12px]" />
      <InputGroupAddon align="inline-end">
        <CopyButton text={cmd} variant="ghost" size="xs" className="size-6 rounded-full text-inherit" />
      </InputGroupAddon>
    </InputGroup>
  )
}

function LibraryDetail({ lib, onClose }: { lib: Library; onClose: () => void }) {
  const update = useApiMutation('libraries', 'update')
  const remove = useApiMutation('libraries', 'remove', { successMessage: 'Перемещено в корзину' })
  const save = (patch: LibraryPatch): void => update.mutate({ id: lib.id, patch })
  const entity = { type: 'library' as const, id: lib.id }
  useEscapeToClose(onClose)

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(lib.id)
        onClose()
      }}
      headerExtra={<LinkButtons lib={lib} />}
      aside={
        <EntityAside
          entity={entity}
          tags={lib.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={lib.createdAt}
          updatedAt={lib.updatedAt}
          files={false}
        />
      }
    >
      <EditorStack>
        <AutoTitle value={lib.name} onSave={(name) => save({ name })} placeholder="Название пакета" />
        <Block label="Для чего">
          <AutoTextarea
            value={lib.purpose}
            onSave={(purpose) => save({ purpose })}
            placeholder="Формы, анимации, слайдеры…"
          />
        </Block>
        <Block label="Статус">
          <PillSelect
            options={LIBRARY_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            value={lib.status}
            onChange={(status) => save({ status })}
          />
        </Block>
        <InputField
          label="Команда установки"
          value={lib.installCmd}
          onSave={(installCmd) => save({ installCmd })}
          placeholder={`npm i ${lib.name}`}
          className="font-mono"
        />
        <div className="grid grid-cols-3 gap-3">
          <InputField label="npm" value={lib.npmUrl} onSave={(npmUrl) => save({ npmUrl })} placeholder="https://npmjs.com/package/…" />
          <InputField label="GitHub" value={lib.githubUrl} onSave={(githubUrl) => save({ githubUrl })} placeholder="https://github.com/…" />
          <InputField label="Документация" value={lib.docsUrl} onSave={(docsUrl) => save({ docsUrl })} placeholder="https://…" />
        </div>
        <AutoMarkdown
          label="Заметки"
          value={lib.notes}
          onSave={(notes) => save({ notes })}
          placeholder="Как подключал, подводные камни, пример использования"
        />
      </EditorStack>
    </DetailPane>
  )
}

function LibraryCard({ lib, active, compact, onOpen }: { lib: Library; active: boolean; compact: boolean; onOpen: () => void }) {
  return (
    <Card
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen()}
      aria-current={active || undefined}
      className={cn(
        'cursor-pointer gap-3 py-4 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
        active ? 'bg-ink text-ink-foreground' : 'hover:bg-accent'
      )}
    >
      <CardHeader className="gap-1 px-4">
        <div className="font-display truncate text-[20px] leading-tight">{lib.name}</div>
        <div className={cn('flex items-center gap-1.5 text-[12px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
          <span className={cn('size-1.5 rounded-full', STATUS_DOT[lib.status])} />
          {STATUS_LABEL[lib.status]}
        </div>
      </CardHeader>
      {(lib.purpose || (!compact && lib.installCmd.trim())) && (
        <CardContent className="flex flex-col gap-3 px-4">
          {lib.purpose && (
            <p className={cn('line-clamp-2 text-[13px]', active ? 'text-ink-foreground/85' : 'text-foreground/80')}>{lib.purpose}</p>
          )}
          {!compact && <InstallCommand cmd={lib.installCmd} onInk={active} />}
        </CardContent>
      )}
      {!compact && (
        <CardFooter className="mt-auto items-end justify-between gap-2 px-4">
          <TagList tags={lib.tags} max={3} />
          <LinkButtons lib={lib} onInk={active} />
        </CardFooter>
      )}
    </Card>
  )
}

export function LibrariesPage() {
  const [status, setStatus] = useState<LibraryStatus | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const q = useDebounced(search.trim())
  const base = { search: q || undefined, tagId }
  // Full list only feeds the status chips; the rendered grid is paged + virtualized.
  const { data: all = [] } = useApi('libraries', 'list', base)
  const list = useInfiniteApi('libraries', 'list', { ...base, status })
  const { data: openItem } = useApi('libraries', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('libraries', 'create')

  const counts = useMemo(() => countBy(all, (l) => l.status), [all])

  return (
    <Page>
      <PageHeader
        title="JS-библиотеки"
        subtitle="Что использовал, что хочется попробовать, и как это поставить."
        actions={
          <Button
            variant="lime"
            onClick={async () => {
              const created = await create.mutateAsync({ name: 'new-package', status: status ?? 'want' })
              setOpen(created.id)
            }}
          >
            <Plus /> Библиотека
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            allLabel="Все"
            value={status}
            onChange={setStatus}
            options={LIBRARY_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s] ?? 0 }))}
          />
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Название или задача" className="w-60" />
          </div>
        </div>
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualGrid
              className="-mx-1 px-1"
              items={list.items}
              getKey={(l) => l.id}
              minColumnWidth={openId ? 10_000 : 300}
              rowHeight={openId ? 90 : 210}
              gap={8}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              renderItem={(l) => <LibraryCard lib={l} active={l.id === openId} compact={!!openId} onOpen={() => setOpen(l.id)} />}
              empty={
                !list.isLoading && (
                  <EmptyState
                    icon={Package}
                    title={search || tagId || status ? 'Ничего не нашлось' : 'Список пуст'}
                    hint={
                      search || tagId || status
                        ? 'Снимите фильтр или поищите по задаче: «формы», «анимации».'
                        : 'Добавьте пакет, который понравился, с командой установки и ссылками.'
                    }
                  />
                )
              }
            />
          }
          listSize="30%"
          detail={openId && openItem ? <LibraryDetail key={openItem.id} lib={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
