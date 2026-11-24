/** Knowledge hub overview: summary per section + what needs attention. */
import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUpRight, Bug, Copy, Package } from 'lucide-react'
import { ENTITY_META, type EntityType } from '@shared/entity-types'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtRelative, plural } from '@/lib/format'
import { ENTITY_ICON } from '@/app/navigation'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { EntityRow } from '@/components/common/entity-link'
import { copyText } from '@/components/common/copy-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { cn } from '@/lib/utils'

const SECTIONS: { type: EntityType; label: string; path: string; forms: [string, string, string] }[] = [
  { type: 'note', label: 'Заметки', path: '/notes', forms: ['заметка', 'заметки', 'заметок'] },
  { type: 'claude', label: 'Claude', path: '/claude', forms: ['запись', 'записи', 'записей'] },
  { type: 'snippet', label: 'Сниппеты', path: '/snippets', forms: ['сниппет', 'сниппета', 'сниппетов'] },
  { type: 'component', label: 'Компоненты', path: '/components', forms: ['компонент', 'компонента', 'компонентов'] },
  { type: 'library', label: 'JS-библиотеки', path: '/libraries', forms: ['библиотека', 'библиотеки', 'библиотек'] },
  { type: 'fix', label: 'Ошибки и решения', path: '/fixes', forms: ['ошибка', 'ошибки', 'ошибок'] }
]

const KNOWLEDGE_TYPES = new Set<EntityType>(SECTIONS.map((s) => s.type))

function SectionCards({ counts }: { counts: Partial<Record<EntityType, number>> }) {
  const navigate = useNavigate()
  return (
    <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
      {SECTIONS.map((s, i) => {
        const Icon = ENTITY_ICON[s.type]
        const n = counts[s.type] ?? 0
        const inverted = i === 0
        return (
          <Button
            key={s.type}
            variant="soft"
            onClick={() => navigate(s.path)}
            className={cn(
              'group h-[124px] flex-col items-stretch justify-between rounded-3xl p-4 text-left whitespace-normal',
              inverted && 'bg-ink text-ink-foreground hover:bg-ink/90'
            )}
          >
            <span className="flex items-center justify-between">
              <span className={cn('grid size-9 place-items-center rounded-full', inverted ? 'bg-ink-foreground/10' : 'bg-card')}>
                <Icon className={inverted ? 'text-ink-accent' : undefined} />
              </span>
              <ArrowUpRight className="opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <span>
              <span className="font-display block text-[28px] leading-none tabular-nums">{n}</span>
              <span className={cn('mt-1 block text-[12.5px] font-normal', inverted ? 'text-ink-muted' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </span>
          </Button>
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
  return <p className="text-[13px] text-muted-foreground">{children}</p>
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
    <ListCard title="Часто копирую" className="col-span-6">
      {top.length ? (
        <ItemGroup className="gap-1.5">
          {top.map((x) => {
            const Icon = ENTITY_ICON[x.type]
            return (
              <Item key={`${x.type}:${x.id}`} size="xs" className="group bg-card">
                <Icon className="size-4 text-muted-foreground" />
                <ItemContent className="min-w-0 gap-0">
                  <ItemTitle className="w-full truncate font-normal">
                    <Button variant="link" className="h-auto truncate p-0 text-[13px] font-normal" onClick={() => navigate(ENTITY_META[x.type].route(x.id))}>
                      {x.title}
                    </Button>
                  </ItemTitle>
                  <ItemDescription className="text-[11.5px]">
                    {x.sub} · {x.count} {plural(x.count, ['раз', 'раза', 'раз'])}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Скопировать"
                    onClick={async () => {
                      await copyText(x.text)
                      if (x.type === 'snippet') markSnippet.mutate(x.id)
                      else markPrompt.mutate(x.id)
                    }}
                  >
                    <Copy />
                  </Button>
                </ItemActions>
              </Item>
            )
          })}
        </ItemGroup>
      ) : (
        <Empty>Копируйте сниппеты и промты кнопкой — самые нужные соберутся здесь.</Empty>
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
  const counts = dash?.counts ?? {}
  const total = SECTIONS.reduce((s, x) => s + (counts[x.type] ?? 0), 0)

  return (
    <Page>
      <PageHeader
        title="Знания"
        subtitle={`${total} ${plural(total, ['запись', 'записи', 'записей'])} — заметки, промты, код и решения в одном месте.`}
      />
      <PageBody>
        <div className="flex flex-col gap-3">
          <SectionCards counts={counts} />
          <div className="grid grid-cols-12 gap-3">
            <ListCard title="Недавнее" className="col-span-6">
              {recent.length ? (
                <div className="-mx-2.5 flex flex-col">
                  {recent.map((r) => (
                    <EntityRow
                      key={`${r.type}:${r.id}`}
                      item={r}
                      trailing={<span className="text-[11px] text-muted-foreground">{fmtRelative(r.updatedAt)}</span>}
                    />
                  ))}
                </div>
              ) : (
                <Empty>Здесь появятся последние изменённые записи из всех разделов знаний.</Empty>
              )}
            </ListCard>
            <MostCopied />
            <ListCard
              title="Нерешённые ошибки"
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
                <Empty>Всё решено. Отмечайте «Ещё не решено», чтобы вернуться к проблеме позже.</Empty>
              )}
            </ListCard>
            <ListCard
              title="Хочу попробовать"
              className="col-span-6"
              action={
                <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => navigate('/libraries')}>
                  Все библиотеки
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
                      title={l.purpose || undefined}
                      onClick={() => navigate(ENTITY_META.library.route(l.id))}
                    >
                      <Package />
                      <span className="truncate">{l.name}</span>
                    </Button>
                  ))}
                </div>
              ) : (
                <Empty>Отметьте библиотеку статусом «Хочу попробовать» — список соберётся здесь.</Empty>
              )}
            </ListCard>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
