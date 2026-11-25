import { useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, FolderGit2, Lock } from 'lucide-react'
import { openUrl } from '@/lib/open-url'
import { useApi } from '@/lib/query'
import { fmtRelative } from '@/lib/format'
import { EmptyState, NoResults, SearchInput } from '@/components/common/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { GithubLoadError } from './github-load-error'

/** Your repositories: the name opens GitHub, «Локально» opens the project folder added to Vault. */
export function ReposTab(): ReactElement | null {
  const navigate = useNavigate()
  const { data: repos, error, isLoading, refetch } = useApi('github', 'repos', { force: false })
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const list = (repos ?? []).filter((r) => !q || r.fullName.toLowerCase().includes(q))
  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />
  if (!repos) return error ? <GithubLoadError error={error} onRetry={() => void refetch()} /> : null
  return (
    <div className="flex flex-col gap-3">
      <SearchInput value={search} onChange={setSearch} placeholder="Знайти репозиторій" />
      {list.length > 0 && (
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
              <TableRow key={r.fullName}>
                <TableCell className="max-w-90">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="link"
                      className="font-medium no-underline hover:underline"
                      onClick={() => openUrl(r.url)}
                    >
                      {r.fullName}
                    </Button>
                    {r.private && (
                      <Badge variant="outline">
                        <Lock /> приватний
                      </Badge>
                    )}
                    {r.fork && <Badge variant="soft">форк</Badge>}
                  </div>
                  {r.description && (
                    <div className="truncate text-caption text-muted-foreground">
                      {r.description}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.language ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{r.stars}</TableCell>
                <TableCell className="text-right tabular-nums">{r.openIssues}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.pushedAt ? fmtRelative(r.pushedAt) : '—'}
                </TableCell>
                <TableCell>
                  {r.localProjectId ? (
                    // Neutral in a repeated row: the screen keeps one lime action.
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => navigate(`/dev?open=${r.localProjectId}`)}
                    >
                      Локально <ArrowRight />
                    </Button>
                  ) : (
                    <span
                      className="text-caption text-muted-foreground"
                      title="Додайте папку репозиторію в «Мої проєкти» — зв’язок визначиться за git remote"
                    >
                      немає папки
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {list.length === 0 &&
        (repos.length && q ? (
          <NoResults
            icon={FolderGit2}
            hint={`За запитом «${search.trim()}» репозиторіїв немає.`}
            onReset={() => setSearch('')}
          />
        ) : (
          <EmptyState
            title="Репозиторіїв немає"
            hint="Перевірте, що токен має доступ до потрібних репозиторіїв."
          />
        ))}
    </div>
  )
}
