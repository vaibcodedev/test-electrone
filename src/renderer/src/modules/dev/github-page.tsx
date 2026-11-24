import { useMemo, useState } from 'react'
import { openUrl } from '@/lib/open-url'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import { GitCommitHorizontal, GitPullRequest, Lock, MessageSquare, CircleDot, RefreshCw, Star, Unplug } from 'lucide-react'
import type { GithubIssue } from '@shared/domain/dev'
import { invalidateAll, useApi, useApiMutation } from '@/lib/query'
import { LOCALE, dayKey, fmtRelative } from '@/lib/format'
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
  return <p className="rounded-xl bg-destructive/10 px-4 py-3 text-body text-destructive">{(error as Error).message}</p>
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
      <SearchInput value={search} onChange={setSearch} placeholder="Знайти репозиторій" className="max-w-sm" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Репозиторій</TableHead>
            <TableHead>Мова</TableHead>
            <TableHead className="text-right">★</TableHead>
            <TableHead className="text-right">Issues</TableHead>
            <TableHead>Останній push</TableHead>
            <TableHead>Локально</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.fullName} className="cursor-pointer" onClick={() => openUrl(r.url)}>
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
                {r.description && <div className="truncate text-caption text-muted-foreground">{r.description}</div>}
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
                  <span className="text-caption text-muted-foreground" title="Додайте папку репозиторію в «Мої проєкти» — зв’язок визначиться за git remote">
                    немає папки
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {repos && !list.length && <EmptyState title="Репозиторіїв немає" hint="Перевірте, що токен має доступ до потрібних репозиторіїв." />}
    </div>
  )
}

type IssueKind = 'issue' | 'pr'

function IssueRow({ issue: i }: { issue: GithubIssue }) {
  return (
    <Item asChild size="sm" variant="muted" className="cursor-pointer">
      <button type="button" className="w-full text-left" onClick={() => openUrl(i.url)}>
        <ItemMedia variant="icon" className="bg-card">
          {i.isPullRequest ? <GitPullRequest /> : <CircleDot className="text-success" />}
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full truncate">
            {i.title} <span className="font-normal text-muted-foreground">#{i.number}</span>
          </ItemTitle>
          <ItemDescription className="flex flex-wrap items-center gap-1.5 text-meta">
            <Badge variant="outline">{i.repo}</Badge>
            {i.labels.map((l) => (
              <Badge key={l.name} variant="soft" className="bg-card">
                <span className="size-1.5 rounded-full" style={{ background: l.color }} />
                {l.name}
              </Badge>
            ))}
            <span>
              {i.author} · оновлено {fmtRelative(i.updatedAt)}
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
          allLabel="Усі"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'issue', label: 'Issues', count: (issues ?? []).filter((i) => !i.isPullRequest).length },
            { value: 'pr', label: 'Pull requests', count: (issues ?? []).filter((i) => i.isPullRequest).length }
          ]}
        />
        <Select value={repo} onValueChange={setRepo}>
          <SelectTrigger size="sm" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Усі репозиторії</SelectItem>
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
        <EmptyState icon={CircleDot} title="Відкритих задач немає" hint="Тут з’являться відкриті issues і pull requests, де ви автор, виконавець або вас згадано." />
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
      const key = dayKey(c.at)
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
          <SelectItem value={ALL}>Останні активні репозиторії</SelectItem>
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
            <h3 className="text-caption font-semibold text-muted-foreground capitalize">{format(new Date(day), 'EEEE, d MMMM', { locale: LOCALE })}</h3>
            <ItemGroup className="gap-1">
              {list.map((c) => (
                <Item key={`${c.repo}:${c.sha}`} asChild size="xs" variant="muted" className="cursor-pointer">
                  <button type="button" className="w-full text-left" onClick={() => openUrl(c.url)}>
                    <ItemMedia>
                      <GitCommitHorizontal className="size-4 text-muted-foreground" />
                    </ItemMedia>
                    <ItemContent className="min-w-0 gap-0">
                      <ItemTitle className="w-full truncate font-normal">{c.message}</ItemTitle>
                      <ItemDescription className="text-meta">
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
        <EmptyState icon={GitCommitHorizontal} title="Комітів немає" />
      )}
    </div>
  )
}

/** GitHub: repos, open issues/PRs and recent commits (read-only token). */
export function GithubPage() {
  const { data: status, isLoading } = useApi('github', 'status')
  const disconnect = useApiMutation('github', 'setToken', { successMessage: 'GitHub відключено' })
  const [force, setForce] = useState(0)
  const [tab, setTab] = useState('repos')

  if (isLoading) return null

  if (!status?.connected) {
    return (
      <Page>
        <PageHeader title="GitHub" subtitle="Репозиторії, відкриті issues й останні коміти в одному місці." />
        <PageBody>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-lead text-foreground">Підключіть GitHub</CardTitle>
              <CardDescription className="text-caption">
                Потрібен fine-grained токен лише на читання. Vault нічого не змінює у ваших репозиторіях.
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
              <AvatarFallback className="text-meta">{status.login?.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            {status.name ? `${status.name} · ` : ''}@{status.login}
            {status.rateRemaining !== null && <Badge variant="soft">запитів залишилося: {status.rateRemaining}</Badge>}
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
              <RefreshCw /> Оновити
            </Button>
            <Confirm title="Відключити GitHub?" description="Токен буде видалено з Vault. На GitHub його можна відкликати окремо." confirmLabel="Відключити" onConfirm={() => disconnect.mutate({ token: '' })}>
              <Button variant="ghost">
                <Unplug /> Відключити
              </Button>
            </Confirm>
          </>
        }
      />
      <PageBody>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="repos">
              <Star /> Репозиторії
            </TabsTrigger>
            <TabsTrigger value="issues">
              <CircleDot /> Issues і PR
            </TabsTrigger>
            <TabsTrigger value="commits">
              <GitCommitHorizontal /> Коміти
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
