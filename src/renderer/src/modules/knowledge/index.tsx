/** Knowledge hub overview: summary per section + what needs attention. */
import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight, Bug, Package } from 'lucide-react'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtRelative, plural } from '@/lib/format'
import { clickableProps } from '@/lib/clickable'
import { ENTITY_ICON } from '@/app/navigation'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { EntityRow } from '@/components/common/entity-link'
import { CopyButton } from '@/components/common/copy-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'

const SECTIONS: { type: EntityType; label: string; path: string; forms: [string, string, string] }[] = [
  { type: 'note', label: 'Нотатки', path: '/notes', forms: ['нотатка', 'нотатки', 'нотаток'] },
  { type: 'claude', label: 'Claude', path: '/claude', forms: ['запис', 'записи', 'записів'] },
  { type: 'snippet', label: 'Сніпети', path: '/snippets', forms: ['сніпет', 'сніпети', 'сніпетів'] },
  { type: 'component', label: 'Компоненти', path: '/components', forms: ['компонент', 'компоненти', 'компонентів'] },
  { type: 'library', label: 'JS-бібліотеки', path: '/libraries', forms: ['бібліотека', 'бібліотеки', 'бібліотек'] },
  { type: 'fix', label: 'Помилки й рішення', path: '/fixes', forms: ['помилка', 'помилки', 'помилок'] }
]

const KNOWLEDGE_TYPES = new Set<EntityType>(SECTIONS.map((s) => s.type))

/** Section tiles: count + name, one neutral `tile` each. `counts` is undefined while the dashboard loads. */
function SectionCards({ counts }: { counts: Partial<Record<EntityType, number>> | undefined }) {
  const navigate = useNavigate()
  return (
    <div className="stagger grid grid-cols-3 gap-3 xl:grid-cols-6">
      {SECTIONS.map((s) => {
        const Icon = ENTITY_ICON[s.type]
        return (
          <Card
            key={s.type}
            {...clickableProps(() => navigate(s.path))}
            className="group tile h-[124px] justify-between gap-0 rounded-3xl p-4"
          >
            <span className="flex items-center justify-between">
              <span className="grid size-9 place-items-center rounded-xl bg-foreground/[0.07]">
                <Icon className="size-4 text-muted-foreground" />
              </span>
              <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </span>
            <span>
              {counts ? (
                <span className="font-display block text-headline leading-none tabular-nums">{counts[s.type] ?? 0}</span>
              ) : (
                <Skeleton className="h-7 w-10" />
              )}
              <span className="mt-1 block text-body font-medium text-muted-foreground">{s.label}</span>
            </span>
          </Card>
        )
      })}
    </div>
  )
}

function ListCard({
  title,
  action,
  children,
  className
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-body leading-relaxed text-muted-foreground">{children}</p>
}

/** Snippets and Claude prompts ordered by how often they were copied. */
function MostCopied() {
  const navigate = useNavigate()
  const { data: snippets = [] } = useApi('snippets', 'list', {})
  const { data: prompts = [] } = useApi('claude', 'list', { kind: 'prompt' })
  const markSnippet = useApiMutation('snippets', 'markCopied', { silent: true })
  const markPrompt = useApiMutation('claude', 'markCopied', { silent: true })
  const top = useMemo(
    () =>
      [
        ...snippets.map((s) => ({ type: 'snippet' as const, id: s.id, title: s.title, text: s.code, count: s.copyCount, sub: s.language })),
        ...prompts.map((p) => ({ type: 'claude' as const, id: p.id, title: p.title, text: p.content, count: p.copyCount, sub: 'Промт' }))
      ]
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 7),
    [snippets, prompts]
  )
  return (
    <ListCard title="Часто копіюю" className="col-span-6">
      {top.length ? (
        <ItemGroup className="gap-1.5">
          {top.map((x) => {
            const Icon = ENTITY_ICON[x.type]
            return (
              <Item key={`${x.type}:${x.id}`} size="xs" className="group bg-card">
                <Icon className="size-4 text-muted-foreground" />
                <ItemContent className="min-w-0 gap-0">
                  <ItemTitle className="w-full truncate font-normal">
                    <Button variant="link" className="h-auto truncate p-0 text-body font-normal no-underline hover:underline" onClick={() => navigate(ENTITY_META[x.type].route(x.id))}>
                      {x.title}
                    </Button>
                  </ItemTitle>
                  <ItemDescription className="text-meta">
                    {x.sub} · {x.count} {plural(x.count, ['раз', 'рази', 'разів'])}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <CopyButton
                    text={x.text}
                    variant="ghost"
                    size="icon-sm"
                    onCopied={() => (x.type === 'snippet' ? markSnippet : markPrompt).mutate(x.id)}
                  />
                </ItemActions>
              </Item>
            )
          })}
        </ItemGroup>
      ) : (
        <Empty>Копіюйте сніпети й промти кнопкою — найпотрібніші зберуться тут.</Empty>
      )}
    </ListCard>
  )
}

export function KnowledgeOverviewPage() {
  const navigate = useNavigate()
  const { data: dash } = useApi('app', 'dashboard')
  const { data: recentAll = [] } = useApi('search', 'recent', 50)
  const { data: openFixes = [] } = useApi('fixes', 'list', { resolved: false })
  const { data: wantLibs = [] } = useApi('libraries', 'list', { status: 'want' })
  const recent = recentAll.filter((r) => KNOWLEDGE_TYPES.has(r.type)).slice(0, 8)
  const counts = dash?.counts
  const total = SECTIONS.reduce((s, x) => s + (counts?.[x.type] ?? 0), 0)

  return (
    <Page>
      <PageHeader
        title="Знання"
        subtitle={
          counts ? `${total} ${plural(total, ['запис', 'записи', 'записів'])} — нотатки, промти, код і рішення в одному місці.` : undefined
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
                      trailing={<span className="text-meta text-muted-foreground">{fmtRelative(r.updatedAt)}</span>}
                    />
                  ))}
                </div>
              ) : (
                <Empty>Тут зʼявляться останні змінені записи з усіх розділів знань.</Empty>
              )}
            </ListCard>
            <MostCopied />
            <ListCard
              title="Невирішені помилки"
              className="col-span-6"
              action={
                openFixes.length > 0 && (
                  <Badge variant="destructive">
                    <Bug /> {openFixes.length}
                  </Badge>
                )
              }
            >
              {openFixes.length ? (
                <div className="-mx-2.5 flex flex-col">
                  {openFixes.slice(0, 6).map((f) => (
                    <EntityRow
                      key={f.id}
                      item={{ type: 'fix', id: f.id, title: f.title, subtitle: f.context || undefined, updatedAt: f.updatedAt }}
                    />
                  ))}
                </div>
              ) : (
                <Empty>
                  {counts?.fix
                    ? 'Усе вирішено. Позначайте «Ще не вирішено», щоб повернутися до проблеми пізніше.'
                    : 'Тут з’являться помилки, які ще не вирішено.'}
                </Empty>
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
                  {wantLibs.slice(0, 12).map((l) => (
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
                <Empty>Позначте бібліотеку статусом «Хочу спробувати» — список збереться тут.</Empty>
              )}
            </ListCard>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
