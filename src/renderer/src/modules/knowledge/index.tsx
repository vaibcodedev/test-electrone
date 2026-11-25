/** Knowledge hub overview: summary per section + what needs attention. */
import type { ReactElement, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight, Bug, Copy, Package, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import type { PaletteColor } from '@shared/colors'
import type { CopiedItem } from '@shared/api'
import { api } from '@/lib/api'
import { useApi, useApiMutation } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { fmtRelative, plural } from '@/lib/format'
import { clickableProps } from '@/lib/clickable'
import { ENTITY_ICON } from '@/app/navigation'
import { LoadError } from '@/features/route-error'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { RowSkeleton } from '@/components/common/page-skeleton'
import { EntityRow } from '@/components/common/entity-link'
import { copyText } from '@/components/common/copy-button'
import { IconAction } from '@/components/common/icon-action'
import { CardEmptyText, ListCard } from '@/components/common/list-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * `color` — the section's own hue from the shared palette (never lime: that is the screen's one accent), tinting
 * its icon so six tiles don't read as one grey block; `hint` — what goes there, said while the section is empty.
 */
const SECTIONS: {
  type: EntityType
  label: string
  path: string
  color: PaletteColor
  hint: string
}[] = [
  {
    type: 'note',
    label: 'Нотатки',
    path: '/notes',
    color: '#5aa9f0',
    hint: 'Домовленості, процеси, чернетки'
  },
  {
    type: 'claude',
    label: 'Claude',
    path: '/claude',
    color: '#c98af0',
    hint: 'Промти й вдалі відповіді'
  },
  {
    type: 'snippet',
    label: 'Сніпети',
    path: '/snippets',
    color: '#7c8cf8',
    hint: 'Шматки коду під рукою'
  },
  {
    type: 'component',
    label: 'Компоненти',
    path: '/components',
    color: '#3fbf9b',
    hint: 'UI з живим превью'
  },
  {
    type: 'library',
    label: 'JS-бібліотеки',
    path: '/libraries',
    color: '#f5a524',
    hint: 'Пакети з нотатками'
  },
  {
    type: 'fix',
    label: 'Помилки й рішення',
    path: '/fixes',
    color: '#f06b6b',
    hint: 'Помилка → як вирішили'
  }
]

const KNOWLEDGE_TYPES = new Set<EntityType>(SECTIONS.map((s) => s.type))

/** Section tiles: count + name, one neutral `tile` each. `counts` is undefined while the dashboard loads. */
function SectionCards({
  counts
}: {
  counts: Partial<Record<EntityType, number>> | undefined
}): ReactElement {
  const navigate = useNavigate()
  return (
    <div className="stagger grid grid-cols-3 gap-3 xl:grid-cols-6">
      {SECTIONS.map((s) => {
        const Icon = ENTITY_ICON[s.type]
        const count = counts?.[s.type] ?? 0
        return (
          <Card
            key={s.type}
            {...clickableProps(() => navigate(s.path))}
            className="group tile h-31 justify-between gap-0 rounded-3xl p-4"
          >
            <span className="flex items-center justify-between">
              <span
                className="grid size-9 place-items-center rounded-xl"
                style={{
                  background: `color-mix(in oklab, ${s.color} 18%, transparent)`,
                  color: s.color
                }}
              >
                <Icon className="size-4" />
              </span>
              <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </span>
            <span>
              {!counts ? (
                <Skeleton className="h-7 w-10" />
              ) : count ? (
                <span className="font-display block text-headline leading-none tabular-nums">
                  {count}
                </span>
              ) : (
                // A tile without data says what belongs there (§8): six big «0» read as broken statistics, six
                // «поки порожньо» as a grey wall.
                <span className="flex h-7 items-end text-caption text-muted-foreground">
                  {s.hint}
                </span>
              )}
              <span className="mt-1 block truncate text-body font-semibold text-foreground">
                {s.label}
              </span>
            </span>
          </Card>
        )
      })}
    </div>
  )
}

interface ListQuery {
  isLoading: boolean
  isError: boolean
  refetch: () => unknown
}

const ROW_STUBS = (
  <div className="flex flex-col gap-1.5">
    {[0, 1, 2].map((i) => (
      // bg-card: the default surface stub would melt into the surface card.
      <RowSkeleton key={i} height={40} className="bg-card" />
    ))}
  </div>
)

const CHIP_STUBS = (
  <div className="flex flex-wrap gap-2">
    {[0, 1, 2, 3, 4].map((i) => (
      <Skeleton key={i} className="h-8 w-24 rounded-full" />
    ))}
  </div>
)

/**
 * A list card with no rows to show: stubs while the query loads, an error with «Повторити», and only then
 * the empty phrase — otherwise the card claimed there was nothing while the data was still on its way.
 */
function NoRows({
  query,
  stubs = ROW_STUBS,
  children
}: {
  query: ListQuery
  stubs?: ReactNode
  children: ReactNode
}): ReactElement {
  if (query.isLoading) return <>{stubs}</>
  if (query.isError)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <CardEmptyText>Не вдалося завантажити.</CardEmptyText>
        <Button variant="subtle" size="xs" onClick={() => void query.refetch()}>
          Повторити
        </Button>
      </div>
    )
  return <>{children}</>
}

/** Snippets and Claude prompts ordered by how often they were copied (sorted and cut on the server). */
function MostCopied(): ReactElement {
  const navigate = useNavigate()
  const top = useApi('knowledge', 'mostCopied', 7)
  const markSnippet = useApiMutation('snippets', 'markCopied', { silent: true })
  const markPrompt = useApiMutation('claude', 'markCopied', { silent: true })
  // The list carries no code or prompt text: the record is fetched at the moment of copying.
  const copy = async (x: CopiedItem): Promise<void> => {
    let text: string | undefined
    try {
      text =
        x.type === 'snippet'
          ? (await api.snippets.get(x.id))?.code
          : (await api.claude.get(x.id))?.content
    } catch (e) {
      reportError(e, 'copy')
    }
    if (text === undefined) return void toast.error('Не вдалося скопіювати')
    if (await copyText(text)) (x.type === 'snippet' ? markSnippet : markPrompt).mutate(x.id)
  }
  const items = top.data ?? []
  return (
    <ListCard title="Часто копіюю" className="col-span-6">
      {items.length ? (
        <ItemGroup className="gap-1.5">
          {items.map((x) => {
            const Icon = ENTITY_ICON[x.type]
            return (
              <Item key={`${x.type}:${x.id}`} size="xs" className="group bg-card">
                <Icon className="size-4 text-muted-foreground" />
                <ItemContent className="min-w-0 gap-0">
                  <ItemTitle className="w-full truncate font-normal">
                    <Button
                      variant="link"
                      className="h-auto truncate p-0 text-body font-normal no-underline hover:underline"
                      title={x.title}
                      onClick={() => navigate(ENTITY_META[x.type].route(x.id))}
                    >
                      {x.title}
                    </Button>
                  </ItemTitle>
                  <ItemDescription className="text-meta">
                    {x.sub} · {x.count} {plural(x.count, ['раз', 'рази', 'разів'])}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <IconAction label="Скопіювати" size="icon-sm" onClick={() => void copy(x)}>
                    <Copy />
                  </IconAction>
                </ItemActions>
              </Item>
            )
          })}
        </ItemGroup>
      ) : (
        <NoRows query={top}>
          <CardEmptyText>
            Копіюйте сніпети й промти кнопкою — найпотрібніші зберуться тут.
          </CardEmptyText>
        </NoRows>
      )}
    </ListCard>
  )
}

export function KnowledgeOverviewPage(): ReactElement {
  const navigate = useNavigate()
  const dash = useApi('app', 'dashboard')
  const recentQuery = useApi('search', 'recent', 50)
  const fixes = useApi('fixes', 'list', { resolved: false, limit: 6 })
  const fixCounts = useApi('fixes', 'counts')
  const libs = useApi('libraries', 'list', { status: 'want', limit: 12 })
  const createNote = useApiMutation('notes', 'create')
  const recent = (recentQuery.data ?? []).filter((r) => KNOWLEDGE_TYPES.has(r.type)).slice(0, 8)
  const openFixes = fixes.data ?? []
  const wantLibs = libs.data ?? []
  const counts = dash.data?.counts
  const total = SECTIONS.reduce((s, x) => s + (counts?.[x.type] ?? 0), 0)
  const openCount = fixCounts.data?.open ?? 0
  const allResolved = !!fixCounts.data && fixCounts.data.open === 0 && fixCounts.data.resolved > 0

  if (!dash.data && dash.isError)
    return <LoadError title="Не вдалося завантажити «Знання»" onRetry={() => void dash.refetch()} />

  const newNote = (): void => {
    if (createNote.isPending) return
    createNote.mutate(
      { title: 'Нова нотатка', folder: '' },
      { onSuccess: (n) => navigate(ENTITY_META.note.route(n.id)) }
    )
  }

  return (
    <Page>
      <PageHeader
        title="Знання"
        subtitle={
          !counts
            ? undefined
            : total
              ? `${total} ${plural(total, ['запис', 'записи', 'записів'])} — нотатки, промти, код і рішення в одному місці.`
              : 'Нотатки, промти, код і рішення в одному місці.'
        }
      />
      <PageBody>
        <div className="flex flex-col gap-3">
          <SectionCards counts={counts} />
          <div className="stagger grid grid-cols-12 gap-3">
            <ListCard title="Нещодавнє" className="col-span-6">
              {recent.length ? (
                <div className="-mx-2.5 flex flex-col">
                  {recent.map((r) => (
                    <EntityRow
                      key={`${r.type}:${r.id}`}
                      item={r}
                      trailing={
                        <span className="text-meta text-muted-foreground">
                          {fmtRelative(r.updatedAt)}
                        </span>
                      }
                    />
                  ))}
                </div>
              ) : (
                <NoRows query={recentQuery}>
                  <div className="flex flex-col items-start gap-3">
                    <CardEmptyText>
                      Тут з’являться останні змінені записи з усіх розділів знань.
                    </CardEmptyText>
                    {counts && total === 0 && (
                      <Button
                        variant="subtle"
                        size="xs"
                        disabled={createNote.isPending}
                        onClick={newNote}
                      >
                        <Plus /> Створити нотатку
                      </Button>
                    )}
                  </div>
                </NoRows>
              )}
            </ListCard>
            <MostCopied />
            <ListCard
              title="Невирішені помилки"
              className="col-span-6"
              action={
                openCount > 0 && (
                  <Badge variant="destructive">
                    <Bug /> {openCount}
                  </Badge>
                )
              }
            >
              {openFixes.length ? (
                <div className="-mx-2.5 flex flex-col">
                  {openFixes.map((f) => (
                    <EntityRow
                      key={f.id}
                      item={{
                        type: 'fix',
                        id: f.id,
                        title: f.title,
                        subtitle: f.context || undefined,
                        updatedAt: f.updatedAt
                      }}
                    />
                  ))}
                </div>
              ) : (
                // The phrase depends on the counts too: «Усе вирішено» flashed while the list was still loading.
                <NoRows
                  query={{
                    isLoading: fixes.isLoading || fixCounts.isLoading,
                    isError: fixes.isError,
                    refetch: fixes.refetch
                  }}
                >
                  <CardEmptyText>
                    {allResolved
                      ? 'Усе вирішено. Щоб повернутися до проблеми пізніше, зніміть у записі позначку «Вирішено».'
                      : 'Тут з’являться помилки, які ще не вирішено.'}
                  </CardEmptyText>
                </NoRows>
              )}
            </ListCard>
            <ListCard
              title="Хочу спробувати"
              className="col-span-6"
              action={
                <Button variant="subtle" size="xs" onClick={() => navigate('/libraries')}>
                  Усі бібліотеки
                </Button>
              }
            >
              {wantLibs.length ? (
                <div className="flex flex-wrap gap-2">
                  {wantLibs.map((l) => (
                    <Button
                      key={l.id}
                      variant="soft"
                      size="sm"
                      className="max-w-full bg-card font-normal hover:ring-1 hover:ring-border"
                      title={l.name}
                      onClick={() => navigate(ENTITY_META.library.route(l.id))}
                    >
                      <Package />
                      <span className="truncate">{l.name}</span>
                    </Button>
                  ))}
                </div>
              ) : (
                <NoRows query={libs} stubs={CHIP_STUBS}>
                  <CardEmptyText>
                    Позначте бібліотеку статусом «Хочу спробувати» — список збереться тут.
                  </CardEmptyText>
                </NoRows>
              )}
            </ListCard>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
