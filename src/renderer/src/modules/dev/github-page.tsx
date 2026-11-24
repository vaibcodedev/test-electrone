import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { GitCommitHorizontal, GitPullRequest, Lock, MessageSquare, CircleDot, RefreshCw, Star, Unplug } from 'lucide-react'
import type { GithubIssue } from '@shared/domain/dev'
import { api } from '@/lib/api'
import { invalidateAll, useApi, useApiMutation } from '@/lib/query'
import { LOCALE, fmtRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GithubGuide } from './github-connect'

const ALL = '__all'

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  return <p className="rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">{(error as Error).message}</p>
}

function ReposTab({ force }: { force: number }) {
  const navigate = useNavigate()
  const { data: repos, error, isLoading } = useApi('github', 'repos', { force: force > 0 })
  const [search, setSearch] = useState('')
  const list = (repos ?? []).filter((r) => !search.trim() || r.fullName.toLowerCase().includes(search.trim().toLowerCase()))
  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />
  return (
    <div className="flex flex-col gap-3">
      <ErrorNote error={error} />
      <SearchInput value={search} onChange={setSearch} placeholder="Найти репозиторий" className="max-w-sm" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Репозиторий</TableHead>
            <TableHead>Язык</TableHead>
            <TableHead className="text-right">★</TableHead>
            <TableHead className="text-right">Issues</TableHead>
            <TableHead>Последний push</TableHead>
            <TableHead>Локально</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.fullName} className="cursor-pointer" onClick={() => api.app.openExternal(r.url)}>
              <TableCell className="max-w-[360px]">
                <div className="flex items-center gap-1.5 font-medium">
                  {r.fullName}
                  {r.private && (
                    <Badge variant="outline">
                      <Lock /> private
                    </Badge>
                  )}
                  {r.fork && <Badge variant="soft">fork</Badge>}
                </div>
                {r.description && <div className="truncate text-[12px] text-muted-foreground">{r.description}</div>}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.language ?? '—'}</TableCell>
              <TableCell className="text-right tabular-nums">{r.stars}</TableCell>
              <TableCell className="text-right tabular-nums">{r.openIssues}</TableCell>
              <TableCell className="text-muted-foreground">{r.pushedAt ? fmtRelative(r.pushedAt) : '—'}</TableCell>
              <TableCell>
                {r.localProjectId ? (
                  <Button
                    size="xs"
                    variant="lime"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/dev?open=${r.localProjectId}`)
                    }}
                  >
                    Локально
                  </Button>
                ) : (
                  <span className="text-[12px] text-muted-foreground" title="Добавьте папку репозитория в «Мои проекты» — связь определится по git remote">
                    нет папки
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {repos && !list.length && <EmptyState title="Репозиториев нет" hint="Проверьте, что у токена есть доступ к нужным репозиториям." />}
    </div>
  )
}

type IssueKind = 'issue' | 'pr'

function IssueRow({ issue: i }: { issue: GithubIssue }) {
  return (
    <Item asChild size="sm" variant="muted" className="cursor-pointer">
      <button type="button" className="w-full text-left" onClick={() => api.app.openExternal(i.url)}>
        <ItemMedia variant="icon" className="bg-card">
          {i.isPullRequest ? <GitPullRequest /> : <CircleDot className="text-success" />}
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full truncate">
            {i.title} <span className="font-normal text-muted-foreground">#{i.number}</span>
          </ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
            <Badge variant="outline">{i.repo}</Badge>
            {i.labels.map((l) => (
              <Badge key={l.name} variant="soft" className="bg-card">
                <span className="size-1.5 rounded-full" style={{ background: l.color }} />
                {l.name}
              </Badge>
            ))}
            <span>
              {i.author} · обновлено {fmtRelative(i.updatedAt)}
            </span>
            {i.comments > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="size-3" /> {i.comments}
              </span>
            )}
          </ItemDescription>
        </ItemContent>
      </button>
    </Item>
  )
}

function IssuesTab({ force }: { force: number }) {
  const [repo, setRepo] = useState(ALL)
  const [kind, setKind] = useState<IssueKind | undefined>()
  const { data: repos = [] } = useApi('github', 'repos', { force: false })
  const { data: issues, error, isLoading } = useApi('github', 'issues', { repo: repo === ALL ? undefined : repo, force: force > 0 })
  const list = (issues ?? []).filter((i) => !kind || (kind === 'pr') === i.isPullRequest)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChips<IssueKind>
          allLabel="Все"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'issue', label: 'Issues', count: (issues ?? []).filter((i) => !i.isPullRequest).length },
            { value: 'pr', label: 'Pull requests', count: (issues ?? []).filter((i) => i.isPullRequest).length }
          ]}
        />
        <Select value={repo} onValueChange={setRepo}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все репозитории</SelectItem>
            {repos.map((r) => (
              <SelectItem key={r.fullName} value={r.fullName}>
                {r.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : list.length ? (
        <ItemGroup className="gap-1.5">
          {list.map((i) => (
            <IssueRow key={i.id} issue={i} />
          ))}
        </ItemGroup>
      ) : (
        <EmptyState icon={CircleDot} title="Открытых задач нет" hint="Здесь появятся открытые issues и pull requests, где вы автор, исполнитель или упомянуты." />
      )}
    </div>
  )
}

function CommitsTab({ force }: { force: number }) {
  const [repo, setRepo] = useState(ALL)
  const { data: repos = [] } = useApi('github', 'repos', { force: false })
  const { data: commits, error, isLoading } = useApi('github', 'commits', { repo: repo === ALL ? undefined : repo, force: force > 0 })
  const days = useMemo(() => {
    const map = new Map<string, NonNullable<typeof commits>>()
    for (const c of commits ?? []) {
      const key = format(c.at, 'yyyy-MM-dd')
      map.set(key, [...(map.get(key) ?? []), c])
    }
    return [...map.entries()]
  }, [commits])
  return (
    <div className="flex flex-col gap-4">
      <Select value={repo} onValueChange={setRepo}>
        <SelectTrigger className="w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Последние активные репозитории</SelectItem>
          {repos.map((r) => (
            <SelectItem key={r.fullName} value={r.fullName}>
              {r.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ErrorNote error={error} />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : days.length ? (
        days.map(([day, list]) => (
          <section key={day} className="flex flex-col gap-1.5">
            <h3 className="text-[12.5px] font-medium text-muted-foreground capitalize">{format(new Date(day), 'EEEE, d MMMM', { locale: LOCALE })}</h3>
            <ItemGroup className="gap-1">
              {list.map((c) => (
                <Item key={`${c.repo}:${c.sha}`} asChild size="xs" variant="muted" className="cursor-pointer">
                  <button type="button" className="w-full text-left" onClick={() => api.app.openExternal(c.url)}>
                    <ItemMedia>
                      <GitCommitHorizontal className="size-4 text-muted-foreground" />
                    </ItemMedia>
                    <ItemContent className="min-w-0 gap-0">
                      <ItemTitle className="w-full truncate font-normal">{c.message}</ItemTitle>
                      <ItemDescription className="text-[11.5px]">
                        {c.author} · {format(c.at, 'HH:mm')} · <span className="font-mono">{c.sha.slice(0, 7)}</span>
                      </ItemDescription>
                    </ItemContent>
                    <Badge variant="outline">{c.repo}</Badge>
                  </button>
                </Item>
              ))}
            </ItemGroup>
          </section>
        ))
      ) : (
        <EmptyState icon={GitCommitHorizontal} title="Коммитов нет" />
      )}
    </div>
  )
}

/** GitHub: repos, open issues/PRs and recent commits (read-only token). */
export function GithubPage() {
  const { data: status, isLoading } = useApi('github', 'status')
  const disconnect = useApiMutation('github', 'setToken', { successMessage: 'GitHub отключён' })
  const [force, setForce] = useState(0)
  const [tab, setTab] = useState('repos')

  if (isLoading) return null

  if (!status?.connected) {
    return (
      <Page>
        <PageHeader title="GitHub" subtitle="Репозитории, открытые issues и последние коммиты в одном месте." />
        <PageBody>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-[15px] text-foreground">Подключите GitHub</CardTitle>
              <CardDescription className="text-[12.5px]">
                Нужен fine-grained токен только на чтение. Vault ничего не меняет в ваших репозиториях.
                {status?.error && <span className="mt-1 block text-destructive">{status.error}</span>}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GithubGuide />
            </CardContent>
          </Card>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title="GitHub"
        subtitle={
          <span className="flex items-center gap-2">
            <Avatar className="size-5">
              {status.avatarUrl && <AvatarImage src={status.avatarUrl} alt="" />}
              <AvatarFallback className="text-[10px]">{status.login?.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            {status.name ? `${status.name} · ` : ''}@{status.login}
            {status.rateRemaining !== null && <Badge variant="soft">запросов осталось: {status.rateRemaining}</Badge>}
          </span>
        }
        actions={
          <>
            <Button
              variant="soft"
              onClick={() => {
                setForce((n) => n + 1)
                invalidateAll()
              }}
            >
              <RefreshCw /> Обновить
            </Button>
            <Confirm title="Отключить GitHub?" description="Токен будет удалён из Vault. На GitHub его можно отозвать отдельно." confirmLabel="Отключить" onConfirm={() => disconnect.mutate({ token: '' })}>
              <Button variant="ghost">
                <Unplug /> Отключить
              </Button>
            </Confirm>
          </>
        }
      />
      <PageBody>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="repos">
              <Star /> Репозитории
            </TabsTrigger>
            <TabsTrigger value="issues">
              <CircleDot /> Issues и PR
            </TabsTrigger>
            <TabsTrigger value="commits">
              <GitCommitHorizontal /> Коммиты
            </TabsTrigger>
          </TabsList>
          <TabsContent value="repos" className={cn('pt-3')}>
            <ReposTab force={force} />
          </TabsContent>
          <TabsContent value="issues" className="pt-3">
            <IssuesTab force={force} />
          </TabsContent>
          <TabsContent value="commits" className="pt-3">
            <CommitsTab force={force} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </Page>
  )
}
