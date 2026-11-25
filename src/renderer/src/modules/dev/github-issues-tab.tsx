import { useState, type ReactElement } from 'react'
import { CircleDot, GitPullRequest, MessageSquare } from 'lucide-react'
import type { GithubIssue } from '@shared/domain/dev'
import { openUrl } from '@/lib/open-url'
import { useApi } from '@/lib/query'
import { fmtRelative } from '@/lib/format'
import { EmptyState, FilterChips } from '@/components/common/page'
import { Badge } from '@/components/ui/badge'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { RepoSelect } from './github-connect'
import { GithubLoadError } from './github-load-error'

type IssueKind = 'issue' | 'pr'

function IssueRow({ issue: i }: { issue: GithubIssue }): ReactElement {
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

/** Open issues and pull requests where you are the author, assignee or mentioned. */
export function IssuesTab({ repo, onRepoChange }: { repo: string | undefined; onRepoChange: (repo: string | undefined) => void }): ReactElement {
  const [kind, setKind] = useState<IssueKind | undefined>()
  const { data: issues, error, isLoading, refetch } = useApi('github', 'issues', { repo, force: false })
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
        <RepoSelect value={repo} onChange={onRepoChange} allLabel="Усі репозиторії" />
      </div>
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !issues && error ? (
        <GithubLoadError error={error} onRetry={() => void refetch()} />
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
