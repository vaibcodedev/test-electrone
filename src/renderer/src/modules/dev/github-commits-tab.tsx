import { useMemo, type ReactElement } from 'react'
import { format } from 'date-fns'
import { GitCommitHorizontal } from 'lucide-react'
import { openUrl } from '@/lib/open-url'
import { useApi } from '@/lib/query'
import { LOCALE, dayKey } from '@/lib/format'
import { EmptyState } from '@/components/common/page'
import { Badge } from '@/components/ui/badge'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { RepoSelect } from './github-connect'
import { GithubLoadError } from './github-load-error'

/** Recent commits grouped by local day. */
export function CommitsTab({ repo, onRepoChange }: { repo: string | undefined; onRepoChange: (repo: string | undefined) => void }): ReactElement {
  const { data: commits, error, isLoading, refetch } = useApi('github', 'commits', { repo, force: false })
  const days = useMemo(() => {
    const map = new Map<string, NonNullable<typeof commits>>()
    for (const c of commits ?? []) {
      const key = dayKey(c.at)
      map.set(key, [...(map.get(key) ?? []), c])
    }
    return [...map.values()]
  }, [commits])
  return (
    <div className="flex flex-col gap-4">
      <RepoSelect value={repo} onChange={onRepoChange} allLabel="Останні активні репозиторії" />
      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : !commits && error ? (
        <GithubLoadError error={error} onRetry={() => void refetch()} />
      ) : days.length ? (
        days.map((list) => (
          <section key={dayKey(list[0].at)} className="flex flex-col gap-1.5">
            {/* From a commit of the group, not from the key: «2026-01-05» parses as UTC midnight. */}
            <h3 className="text-caption font-semibold text-muted-foreground capitalize">
              {format(list[0].at, 'EEEE, d MMMM', { locale: LOCALE })}
            </h3>
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
                        {c.author} · {format(c.at, 'HH:mm', { locale: LOCALE })} · <span className="font-mono">{c.sha.slice(0, 7)}</span>
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
