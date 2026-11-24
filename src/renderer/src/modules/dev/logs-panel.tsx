import { useEffect, useState } from 'react'
import { ExternalLink, Square, Trash2 } from 'lucide-react'
import type { DevProject, RunningScript } from '@shared/domain/dev'
import { api } from '@/lib/api'
import { useApiMutation } from '@/lib/query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LogView } from './log-view'

const STATUS: Record<RunningScript['status'], { label: string; variant: 'lime' | 'soft' | 'destructive' }> = {
  running: { label: 'работает', variant: 'lime' },
  exited: { label: 'завершён', variant: 'soft' },
  failed: { label: 'ошибка', variant: 'destructive' }
}

/** Bottom panel: one tab per script run with its live log. */
export function LogsPanel({ runs, projects }: { runs: RunningScript[]; projects: DevProject[] }) {
  const [active, setActive] = useState<string | null>(runs[0]?.runId ?? null)
  const stop = useApiMutation('devProjects', 'stop')
  const clear = useApiMutation('devProjects', 'clearFinished')

  useEffect(() => {
    if (!runs.length) setActive(null)
    else if (!active || !runs.some((r) => r.runId === active)) setActive(runs[0].runId)
  }, [runs, active])

  const run = runs.find((r) => r.runId === active)
  const nameOf = (projectId: string): string => projects.find((p) => p.id === projectId)?.name ?? 'Проект'

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-8 pt-2 pb-4">
      <div className="flex items-center gap-2">
        <Tabs value={active ?? ''} onValueChange={setActive} className="min-w-0 flex-1">
          <TabsList className="max-w-full justify-start overflow-x-auto">
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
          <Button size="sm" variant="soft" onClick={() => api.app.openExternal(run.url!)}>
            <ExternalLink /> {run.url.replace(/^https?:\/\//, '')}
          </Button>
        )}
        {run?.status === 'running' && (
          <Button size="sm" variant="outline" onClick={() => stop.mutate(run.runId)}>
            <Square /> Стоп
          </Button>
        )}
        {runs.some((r) => r.status !== 'running') && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Убрать завершённые" onClick={() => clear.mutate(undefined)}>
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Убрать завершённые</TooltipContent>
          </Tooltip>
        )}
      </div>
      {run && <LogView runId={run.runId} className="flex-1" />}
    </div>
  )
}
