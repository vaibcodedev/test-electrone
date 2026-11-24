import { useMemo, useState } from 'react'
import { BookOpen, GitBranch, Package, Plus } from 'lucide-react'
import { LIBRARY_STATUSES, type Library, type LibraryPatch, type LibraryStatus } from '@shared/domain/libraries'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState, Field, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter, TagList } from '@/components/common/tags'
import { CopyButton } from '@/components/common/copy-button'
import { DetailPane, EntityAside, MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { AutoInput, AutoMarkdown, AutoTextarea, AutoTitle, Block, PillSelect, countBy, useEscapeToClose } from '../claude/editor-kit'

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
function LinkButtons({ lib, onDark }: { lib: Library; onDark?: boolean }) {
  const links = [
    { url: lib.npmUrl, label: 'npm', icon: Package },
    { url: lib.githubUrl, label: 'GitHub', icon: GitBranch },
    { url: lib.docsUrl, label: 'Доки', icon: BookOpen }
  ].filter((l) => isUrl(l.url))
  if (!links.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {links.map((l) => (
        <button
          key={l.label}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void api.app.openExternal(l.url)
          }}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors',
            onDark ? 'bg-white/10 hover:bg-white/20' : 'bg-card hover:bg-accent'
          )}
        >
          <l.icon className="size-3.5" />
          {l.label}
        </button>
      ))}
    </div>
  )
}

function InstallPill({ cmd, onDark }: { cmd: string; onDark?: boolean }) {
  if (!cmd.trim()) return null
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full py-1 pr-1 pl-3.5 font-mono text-[12px]',
        onDark ? 'bg-white/8' : 'bg-[var(--code-bg)] text-[var(--code-fg)]'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-lime">$</span>
      <span className="selectable min-w-0 flex-1 truncate">{cmd}</span>
      <CopyButton text={cmd} variant="ghost" size="xs" className="text-inherit hover:bg-white/10" />
    </div>
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
      <div className="flex flex-col gap-5">
        <AutoTitle value={lib.name} onSave={(name) => save({ name })} placeholder="Название пакета" />
        <AutoTextarea
          value={lib.purpose}
          onSave={(purpose) => save({ purpose })}
          placeholder="Для чего она: формы, анимации, слайдеры…"
          className="min-h-10"
        />
        <Block label="Статус">
          <PillSelect
            options={LIBRARY_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            value={lib.status}
            onChange={(status) => save({ status })}
          />
        </Block>
        <Field label="Команда установки">
          <AutoInput
            value={lib.installCmd}
            onSave={(installCmd) => save({ installCmd })}
            placeholder={`npm i ${lib.name}`}
            className="font-mono"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="npm">
            <AutoInput value={lib.npmUrl} onSave={(npmUrl) => save({ npmUrl })} placeholder="https://npmjs.com/package/…" />
          </Field>
          <Field label="GitHub">
            <AutoInput value={lib.githubUrl} onSave={(githubUrl) => save({ githubUrl })} placeholder="https://github.com/…" />
          </Field>
          <Field label="Документация">
            <AutoInput value={lib.docsUrl} onSave={(docsUrl) => save({ docsUrl })} placeholder="https://…" />
          </Field>
        </div>
        <Block label="Заметки">
          <AutoMarkdown
            value={lib.notes}
            onSave={(notes) => save({ notes })}
            placeholder="Как подключал, подводные камни, пример использования"
          />
        </Block>
      </div>
    </DetailPane>
  )
}

function LibraryCard({ lib, active, compact, onOpen }: { lib: Library; active: boolean; compact: boolean; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cn(
        'flex cursor-pointer flex-col gap-3 rounded-3xl p-4 transition-colors',
        active ? 'bg-ink text-ink-foreground' : 'bg-surface hover:bg-accent'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display truncate text-[20px] leading-tight">{lib.name}</div>
          <div className={cn('mt-1 flex items-center gap-1.5 text-[12px]', active ? 'text-ink-muted' : 'text-muted-foreground')}>
            <span className={cn('size-1.5 rounded-full', STATUS_DOT[lib.status])} />
            {STATUS_LABEL[lib.status]}
          </div>
        </div>
      </div>
      {lib.purpose && (
        <p className={cn('line-clamp-2 text-[13px]', active ? 'text-ink-foreground/85' : 'text-foreground/80')}>{lib.purpose}</p>
      )}
      {!compact && (
        <>
          <InstallPill cmd={lib.installCmd} onDark={active} />
          <div className="mt-auto flex items-end justify-between gap-2">
            <TagList tags={lib.tags} max={3} />
            <LinkButtons lib={lib} onDark={active} />
          </div>
        </>
      )}
    </div>
  )
}

export function LibrariesPage() {
  const [status, setStatus] = useState<LibraryStatus | undefined>()
  const [search, setSearch] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [openId, setOpen] = useOpenParam()
  const { data: all = [], isLoading } = useApi('libraries', 'list', { search: search || undefined, tagId })
  const { data: openItem } = useApi('libraries', 'get', openId ?? '', { enabled: !!openId })
  const create = useApiMutation('libraries', 'create')

  const counts = useMemo(() => countBy(all, (l) => l.status), [all])
  const items = status ? all.filter((l) => l.status === status) : all

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
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
              {!isLoading && items.length === 0 && (
                <EmptyState
                  icon={Package}
                  title={search || tagId || status ? 'Ничего не нашлось' : 'Список пуст'}
                  hint={
                    search || tagId || status
                      ? 'Снимите фильтр или поищите по задаче: «формы», «анимации».'
                      : 'Добавьте пакет, который понравился, с командой установки и ссылками.'
                  }
                />
              )}
              <div className={cn('grid gap-2', openId ? 'grid-cols-1' : 'grid-cols-2 xl:grid-cols-3')}>
                {items.map((l) => (
                  <LibraryCard key={l.id} lib={l} active={l.id === openId} compact={!!openId} onOpen={() => setOpen(l.id)} />
                ))}
              </div>
            </div>
          }
          listWidth="w-[320px]"
          detail={openId && openItem ? <LibraryDetail key={openItem.id} lib={openItem} onClose={() => setOpen(null)} /> : null}
        />
      </PageBody>
    </Page>
  )
}
