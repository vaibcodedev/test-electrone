import { useMemo, useState, type ReactElement } from 'react'
import { openUrl } from '@/lib/open-url'
import { BookOpen, GitBranch, Package, Plus } from 'lucide-react'
import { LIBRARY_STATUSES, libraryInputSchema, type Library, type LibraryPatch, type LibraryStatus } from '@shared/domain/libraries'
import { limitsOf, isLikelyUrl } from '@/lib/limits'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { CopyButton } from '@/components/common/copy-button'
import { useReadOnly } from '@/components/common/detail-mode-context'
import { DetailPane, EntityAside, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import {
  AutoMarkdown,
  AutoTitle,
  Block,
  EditorStack,
  InputField,
  PillSelect,
  TextareaBlock,
  UrlBlock,
  countBy
} from '../claude/editor-kit'
import { presentChips } from '../claude/chips'
import { ImportButton } from '@/components/common/import-dialog'

const LIMITS = limitsOf(libraryInputSchema)

const STATUS_LABEL: Record<LibraryStatus, string> = {
  used: 'Використовую',
  favorite: 'Улюблена',
  want: 'Хочу спробувати',
  testing: 'Пробую',
  dropped: 'Не зайшла'
}

const STATUS_DOT: Record<LibraryStatus, string> = {
  used: 'bg-success',
  // Not lime: the accent would repeat in every card of the grid.
  favorite: 'bg-chart-1',
  want: 'bg-info',
  testing: 'bg-warn',
  dropped: 'bg-muted-foreground'
}

const isUrl = (value: string): boolean => !!value.trim() && isLikelyUrl(value)

/** Opens npm / GitHub / docs in the system browser. */
function LinkButtons({ lib, onInk }: { lib: Library; onInk?: boolean }) {
  const links = [
    { url: lib.npmUrl, label: 'npm', icon: Package },
    { url: lib.githubUrl, label: 'GitHub', icon: GitBranch },
    { url: lib.docsUrl, label: 'Документація', icon: BookOpen }
  ].filter((l) => isUrl(l.url))
  if (!links.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {links.map((l) => (
        <Button
          key={l.label}
          variant="subtle"
          size="xs"
          className={cn(onInk && 'bg-ink-foreground/10 text-ink-foreground hover:bg-ink-foreground/15')}
          onClick={(e) => {
            e.stopPropagation()
            void openUrl(l.url)
          }}
        >
          <l.icon />
          {l.label}
        </Button>
      ))}
    </div>
  )
}

/** Install command as a read-only shadcn InputGroup with copy; a quiet placeholder when empty (keeps card height). */
function InstallCommand({ cmd, onInk }: { cmd: string; onInk?: boolean }) {
  if (!cmd.trim()) {
    return (
      <div
        className={cn(
          'flex h-8 items-center rounded-xl border border-dashed px-3 text-caption',
          onInk ? 'border-ink-foreground/20 text-ink-muted' : 'border-foreground/12 text-muted-foreground'
        )}
      >
        Команду встановлення не вказано
      </div>
    )
  }
  return (
    <InputGroup
      onClick={(e) => e.stopPropagation()}
      className={cn('h-8 font-mono', onInk ? 'bg-ink-foreground/8 text-ink-foreground' : 'bg-card')}
    >
      <InputGroupAddon className={cn('font-mono', onInk ? 'text-ink-accent' : 'text-muted-foreground')}>$</InputGroupAddon>
      <InputGroupInput readOnly value={cmd} aria-label="Команда встановлення" className="font-mono text-caption" />
      <InputGroupAddon align="inline-end">
        <CopyButton text={cmd} variant="ghost" size="xs" className="size-6 rounded-full text-inherit" />
      </InputGroupAddon>
    </InputGroup>
  )
}

/** Reading: the command with a copy button (the list's own copy row is hidden while a record is open). */
function InstallField({ lib, save }: { lib: Library; save: (patch: LibraryPatch) => void }): ReactElement | null {
  const readOnly = useReadOnly()
  if (readOnly) {
    if (!lib.installCmd.trim()) return null
    return (
      <Block label="Команда встановлення">
        <InstallCommand cmd={lib.installCmd} />
      </Block>
    )
  }
  return (
    <InputField
      label="Команда встановлення"
      value={lib.installCmd}
      onSave={(installCmd) => save({ installCmd })}
      maxLength={LIMITS.installCmd}
      spellCheck={false}
      placeholder={`Напр.: npm i ${lib.name}`}
      className="font-mono"
    />
  )
}

function LibraryDetail({ lib, onClose }: { lib: Library; onClose: () => void }) {
  const update = useApiMutation('libraries', 'update')
  const remove = useApiMutation('libraries', 'remove', { successMessage: 'Переміщено в кошик' })
  const save = (patch: LibraryPatch): void => update.mutate({ id: lib.id, patch })
  const entity = { type: 'library' as const, id: lib.id }

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
        <AutoTitle value={lib.name} onSave={(name) => save({ name })} placeholder="Назва пакета" maxLength={LIMITS.name} />
        <TextareaBlock
          label="Для чого"
          value={lib.purpose}
          onSave={(purpose) => save({ purpose })}
          maxLength={LIMITS.purpose}
          placeholder="Форми, анімації, слайдери…"
        />
        <Block label="Статус">
          <PillSelect
            options={LIBRARY_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            value={lib.status}
            onChange={(status) => save({ status })}
          />
        </Block>
        <InstallField lib={lib} save={save} />
        {/* Full-width rows: three columns left ~110px per link. Reading: the header's link buttons open them. */}
        <div data-edit-only className="flex flex-col gap-5">
          <UrlBlock label="npm" value={lib.npmUrl} onSave={(npmUrl) => save({ npmUrl })} maxLength={LIMITS.npmUrl} placeholder="https://npmjs.com/package/…" />
          <UrlBlock label="GitHub" value={lib.githubUrl} onSave={(githubUrl) => save({ githubUrl })} maxLength={LIMITS.githubUrl} placeholder="https://github.com/…" />
          <UrlBlock label="Документація" value={lib.docsUrl} onSave={(docsUrl) => save({ docsUrl })} maxLength={LIMITS.docsUrl} />
        </div>
        <AutoMarkdown
          label="Нотатки"
          value={lib.notes}
          onSave={(notes) => save({ notes })}
          placeholder="Як підключав, підводні камені, приклад використання"
          maxLength={LIMITS.notes}
        />
      </EditorStack>
    </DetailPane>
  )
}

function StatusLabel({ status, muted }: { status: LibraryStatus; muted: string }) {
  return (
    <span className={cn('flex shrink-0 items-center gap-1.5 text-meta whitespace-nowrap', muted)}>
      <span className={cn('size-2 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  )
}

/**
 * Grid card in the same language as snippet cards: equal height (h-full, footer pinned), purpose
 * one line with reserved height, install row always present. With a record open the list turns into
 * compact one-line rows (title + status), so a narrow list pane stays readable.
 */
function LibraryCard({ lib, active, compact, onOpen }: { lib: Library; active: boolean; compact: boolean; onOpen: () => void }) {
  const muted = active ? 'text-ink-muted' : 'text-muted-foreground'
  const base = cn(
    'h-full min-w-0 cursor-pointer transition-colors outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
    active ? 'bg-ink text-ink-foreground' : 'tile'
  )
  const keys = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && e.target === e.currentTarget) onOpen()
  }
  if (compact) {
    return (
      <Card role="button" tabIndex={0} onClick={onOpen} onKeyDown={keys} aria-current={active || undefined} className={cn(base, 'gap-0 px-4 py-3')}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-body font-semibold">{lib.name}</span>
          <StatusLabel status={lib.status} muted={muted} />
        </div>
      </Card>
    )
  }
  return (
    <Card role="button" tabIndex={0} onClick={onOpen} onKeyDown={keys} aria-current={active || undefined} className={cn(base, 'gap-3 py-4')}>
      <CardHeader className="gap-1 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-display min-w-0 flex-1 truncate text-heading leading-tight">{lib.name}</span>
          <StatusLabel status={lib.status} muted={muted} />
        </div>
        <div className={cn('min-h-5 truncate text-caption', muted)}>
          {lib.purpose || ' '}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 px-4">
        <InstallCommand cmd={lib.installCmd} onInk={active} />
      </CardContent>
      <CardFooter className="mt-auto min-w-0 items-center justify-between gap-2 px-4">
        <div className="flex min-h-6 min-w-0 flex-1 items-center overflow-hidden">
          <TagList tags={lib.tags} max={3} className="flex-nowrap" />
        </div>
        <LinkButtons lib={lib} onInk={active} />
      </CardFooter>
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
  const statusChips = presentChips(LIBRARY_STATUSES, counts, (s) => STATUS_LABEL[s], status)
  const filtered = !!(search || tagId || status)

  const createNew = async (): Promise<void> => {
    const created = await create.mutateAsync({ name: 'new-package', status: status ?? 'want' })
    setOpen(created.id)
  }

  return (
    <Page>
      <PageHeader
        title="JS-бібліотеки"
        subtitle="Що використовував, що хочеться спробувати й як це встановити."
        actions={
          <>
            <ImportButton kind="library" onImported={(id) => id && setOpen(id)} />
            <Button variant="lime" onClick={() => void createNew()} disabled={create.isPending}>
              <Plus /> Бібліотека
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {statusChips.length > 0 && (
            <FilterChips allLabel="Усі" value={status} onChange={setStatus} options={statusChips} />
          )}
          <div className="ml-auto flex items-center gap-2">
            <TagFilter value={tagId} onChange={setTagId} />
            <SearchInput value={search} onChange={setSearch} placeholder="Назва або призначення" className="w-60" />
          </div>
        </div>
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            <VirtualGrid
              className="-mx-1 px-1"
              items={list.items}
              loading={list.isLoading}
              getKey={(l) => l.id}
              minColumnWidth={openId ? 10_000 : 300}
              rowHeight={openId ? 52 : 200}
              gap={8}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={list.loadMore}
              renderItem={(l) => <LibraryCard lib={l} active={l.id === openId} compact={!!openId} onOpen={() => setOpen(l.id)} />}
              empty={
                !list.isLoading && (
                  <EmptyState
                    icon={Package}
                    title={filtered ? 'Нічого не знайшлося' : 'Бібліотек поки немає'}
                    hint={
                      filtered
                        ? 'Зніміть фільтр або шукайте за призначенням: «форми», «анімації».'
                        : 'Додайте пакет, який сподобався, з командою встановлення й посиланнями.'
                    }
                    action={
                      !filtered && (
                        <Button variant="soft" onClick={() => void createNew()} disabled={create.isPending}>
                          <Plus /> Додати бібліотеку
                        </Button>
                      )
                    }
                  />
                )
              }
            />
          }
          listSize="36%"
          detail={openId && openItem ? <LibraryDetail key={openItem.id} lib={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
