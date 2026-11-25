import { useMemo, useState, type ReactElement } from 'react'
import { openUrl } from '@/lib/open-url'
import { BookOpen, GitBranch, Package, Plus } from 'lucide-react'
import { LIBRARY_STATUSES, libraryInputSchema, type Library, type LibraryPatch, type LibraryStatus } from '@shared/domain/libraries'
import { limitsOf, isLikelyUrl } from '@/lib/limits'
import { clickableProps } from '@/lib/clickable'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { EmptyState, Field, FilterBar, FilterChips, NoResults, Page, PageBody, PageHeader, SearchInput, Segmented } from '@/components/common/page'
import { LinkInput } from '@/components/common/text-field'
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
  TextareaBlock,
  countBy
} from '../claude/editor-kit'
import { noResultsHint, presentChips } from '../claude/chips'
import { ImportButton } from '@/components/common/import-dialog'

const LIMITS = limitsOf(libraryInputSchema)

const STATUS_LABEL: Record<LibraryStatus, string> = {
  used: 'Використовую',
  favorite: 'Улюблена',
  want: 'Хочу спробувати',
  testing: 'Пробую',
  dropped: 'Не зайшла'
}

/** Status badge tone (docs/design-system.md → Чипы и строки): in use — success, trying — info, the rest neutral. */
const STATUS_BADGE: Record<LibraryStatus, 'success' | 'info' | 'soft'> = {
  used: 'success',
  favorite: 'success',
  testing: 'info',
  want: 'soft',
  dropped: 'soft'
}

const isUrl = (value: string): boolean => !!value.trim() && isLikelyUrl(value)

/**
 * Opens npm / GitHub / docs in the system browser. `subtle` on a card (surface); `soft` in the record header,
 * which is card itself — subtle (= bg-card) would read as plain text there.
 */
function LinkButtons({ lib, onInk, variant = 'subtle' }: { lib: Library; onInk?: boolean; variant?: 'subtle' | 'soft' }): ReactElement | null {
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
          variant={variant}
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
      headerExtra={<LinkButtons lib={lib} variant="soft" />}
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
        {/* A record value, not a screen filter: segments; reading shows only the selected one. */}
        <Field label="Статус">
          <Segmented<LibraryStatus>
            size="xs"
            className="data-[variant=segment]:flex-wrap"
            value={lib.status}
            onChange={(status) => save({ status })}
            options={LIBRARY_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
        </Field>
        <InstallField lib={lib} save={save} />
        {/* Full-width rows: three columns left ~110px per link. Reading: the header's link buttons open them. */}
        <div data-edit-only className="flex flex-col gap-5">
          <LinkInput label="npm" value={lib.npmUrl} onSave={(npmUrl) => save({ npmUrl })} maxLength={LIMITS.npmUrl} placeholder="https://npmjs.com/package/…" />
          <LinkInput label="GitHub" value={lib.githubUrl} onSave={(githubUrl) => save({ githubUrl })} maxLength={LIMITS.githubUrl} placeholder="https://github.com/…" />
          <LinkInput label="Документація" value={lib.docsUrl} onSave={(docsUrl) => save({ docsUrl })} maxLength={LIMITS.docsUrl} />
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

/** No status colours on ink: the active card gets the tag-like tint (docs/design-system.md → Бейджи). */
function StatusBadge({ status, onInk }: { status: LibraryStatus; onInk?: boolean }): ReactElement {
  return (
    <Badge
      variant={onInk ? 'soft' : STATUS_BADGE[status]}
      className={cn(
        'h-5 shrink-0',
        status === 'dropped' && !onInk && 'text-muted-foreground',
        onInk && 'bg-ink-foreground/12 text-ink-foreground'
      )}
    >
      {STATUS_LABEL[status]}
    </Badge>
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
  if (compact) {
    return (
      <Card {...clickableProps(onOpen)} aria-current={active || undefined} className={cn(base, 'gap-0 px-4 py-3')}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-body font-semibold">{lib.name}</span>
          <StatusBadge status={lib.status} onInk={active} />
        </div>
      </Card>
    )
  }
  return (
    <Card {...clickableProps(onOpen)} aria-current={active || undefined} className={cn(base, 'gap-3 py-4')}>
      <CardHeader className="gap-1 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-body font-semibold">{lib.name}</span>
          <StatusBadge status={lib.status} onInk={active} />
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
  const filtered = !!(search.trim() || tagId || status)
  const resetFilters = (): void => {
    setSearch('')
    setTagId(undefined)
    setStatus(undefined)
  }

  const createNew = async (): Promise<void> => {
    if (create.isPending) return
    try {
      const created = await create.mutateAsync({ name: 'new-package', status: status ?? 'want' })
      setOpen(created.id)
    } catch {
      // useApiMutation has already shown the error toast; there is nothing to open.
    }
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
        <FilterBar
          chips={
            statusChips.length > 0 && (
              <FilterChips allLabel="Усі" value={status} onChange={setStatus} options={statusChips} />
            )
          }
          trailing={
            <>
              <TagFilter value={tagId} onChange={setTagId} />
              <SearchInput value={search} onChange={setSearch} placeholder="Назва або призначення" />
            </>
          }
        />
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
                !list.isLoading &&
                (filtered ? (
                  <NoResults icon={Package} hint={noResultsHint(search, !!(tagId || status))} onReset={resetFilters} />
                ) : (
                  <EmptyState
                    icon={Package}
                    title="Бібліотек поки немає"
                    hint="Додайте пакет, який сподобався, з командою встановлення й посиланнями."
                    cta={{ label: 'Додати бібліотеку', icon: Plus, onClick: () => void createNew() }}
                  />
                ))
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
