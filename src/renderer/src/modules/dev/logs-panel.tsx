import { useEffect, useState, type ReactElement } from 'react'
import { openUrl } from '@/lib/open-url'
import { ExternalLink, Square, Trash2 } from 'lucide-react'
import type { DevProject, RunningScript } from '@shared/domain/dev'
import { useApiMutation } from '@/lib/query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IconAction } from '@/components/common/icon-action'
import { LogView } from './log-view'

const STATUS: Record<RunningScript['status'], { label: string; variant: 'success' | 'soft' | 'destructive' }> = {
  running: { label: 'працює', variant: 'success' },
  exited: { label: 'завершено', variant: 'soft' },
  failed: { label: 'помилка', variant: 'destructive' }
}

/** Bottom panel: one tab per script run with its live log. */
export function LogsPanel({ runs, projects }: { runs: RunningScript[]; projects: DevProject[] }): ReactElement {
  const [active, setActive] = useState<string | null>(runs[0]?.runId ?? null)
  const stop = useApiMutation('devProjects', 'stop')
  const clear = useApiMutation('devProjects', 'clearFinished')

  useEffect(() => {
    if (!runs.length) setActive(null)
    else if (!active || !runs.some((r) => r.runId === active)) setActive(runs[0].runId)
  }, [runs, active])

  const run = runs.find((r) => r.runId === active)
  const nameOf = (projectId: string): string => projects.find((p) => p.id === projectId)?.name ?? 'Проєкт'

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-8 pt-2 pb-4">
      <div className="flex items-center gap-2">
        <Tabs value={active ?? ''} onValueChange={setActive} className="min-w-0 flex-1">
          <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
            {runs.map((r) => (
              <TabsTrigger key={r.runId} value={r.runId} className="gap-1.5">
                {r.status === 'running' && <span className="size-1.5 animate-pulse rounded-full bg-lime" />}
                <span className="max-w-40 truncate">{nameOf(r.projectId)}</span>
                <span className="text-muted-foreground">{r.script}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {run && <Badge variant={STATUS[run.status].variant}>{STATUS[run.status].label}{run.exitCode !== null ? ` · ${run.exitCode}` : ''}</Badge>}
        {run?.url && (
          <Button size="sm" variant="soft" onClick={() => openUrl(run.url!)}>
            <ExternalLink /> {run.url.replace(/^https?:\/\//, '')}
          </Button>
        )}
        {run?.status === 'running' && (
          <Button size="sm" variant="outline" onClick={() => stop.mutate(run.runId)}>
            <Square /> Зупинити
          </Button>
        )}
        {runs.some((r) => r.status !== 'running') && (
          <IconAction label="Прибрати завершені" onClick={() => clear.mutate(undefined)}>
            <Trash2 />
          </IconAction>
        )}
      </div>
      {run && <LogView runId={run.runId} className="flex-1" />}
    </div>
  )
}
