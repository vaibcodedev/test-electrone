import { useState, type ReactElement } from 'react'
import { CircleDot, GitCommitHorizontal, RefreshCw, Star } from 'lucide-react'
import { api } from '@/lib/api'
import { invalidateAll, useApi } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { cn } from '@/lib/utils'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GithubDisconnectButton, GithubGuide } from './github-connect'
import { ReposTab } from './github-repos-tab'
import { IssuesTab } from './github-issues-tab'
import { CommitsTab } from './github-commits-tab'

/** GitHub: repos, open issues/PRs and recent commits (read-only token). */
export function GithubPage(): ReactElement {
  const { data: status, isLoading } = useApi('github', 'status')
  const [tab, setTab] = useState('repos')
  // Repo filters live here so «Оновити» refreshes exactly what the tabs show.
  const [issuesRepo, setIssuesRepo] = useState<string>()
  const [commitsRepo, setCommitsRepo] = useState<string>()
  const [refreshing, setRefreshing] = useState(false)

  /**
   * Bypasses the service's 5-minute cache once, then the tabs re-read it. A sticky `force` in the query key
   * sent every later refetch (any mutation, window focus) past the cache and burned the rate limit.
   */
  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    await Promise.all([
      api.github.repos({ force: true }),
      api.github.issues({ repo: issuesRepo, force: true }),
      api.github.commits({ repo: commitsRepo, force: true })
    ]).catch((e) => reportError(e, 'github:refresh'))
    invalidateAll()
    setRefreshing(false)
  }

  if (isLoading) return <PageSkeleton kind="list" />

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
            <Button variant="soft" disabled={refreshing} onClick={() => void refresh()}>
              <RefreshCw className={cn(refreshing && 'animate-spin')} /> Оновити
            </Button>
            <GithubDisconnectButton />
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
          <TabsContent value="repos" className="pt-3">
            <ReposTab />
          </TabsContent>
          <TabsContent value="issues" className="pt-3">
            <IssuesTab repo={issuesRepo} onRepoChange={setIssuesRepo} />
          </TabsContent>
          <TabsContent value="commits" className="pt-3">
            <CommitsTab repo={commitsRepo} onRepoChange={setCommitsRepo} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </Page>
  )
}
