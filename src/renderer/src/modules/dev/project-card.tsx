import { ChevronDown, Code2, ExternalLink, FolderOpen, GitBranch, Play, Square, Star, TerminalSquare, Zap } from 'lucide-react'
import { openUrl } from '@/lib/open-url'
import type { DevProject } from '@shared/domain/dev'
import { useApiMutation } from '@/lib/query'
import { fmtRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group'
import { Card, CardContent, CardHeader, CardTitle, CardAction, CardDescription } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { defaultScript, EDITOR_LABEL } from './dev-shared'

export function ProjectCard({ project: p, onOpen }: { project: DevProject; onOpen: () => void }) {
  const open = useApiMutation('devProjects', 'open', { silent: false })
  const run = useApiMutation('devProjects', 'run')
  const stop = useApiMutation('devProjects', 'stop')
  const update = useApiMutation('devProjects', 'update', { silent: false })
  const main = defaultScript(p)
  const running = p.running
  const mainRun = running.find((r) => r.script === main) ?? running[0]
  const url = running.find((r) => r.url)?.url
  const scripts = Object.keys(p.scripts)

  return (
    <Card className={cn('h-full gap-3', !p.exists && 'opacity-60')}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lead text-foreground">
          {running.length > 0 && <span className="size-2 shrink-0 animate-pulse rounded-full bg-lime" aria-label="запущено" />}
          <Button variant="link" className="h-auto truncate p-0 text-lead font-medium no-underline hover:underline" onClick={onOpen}>
            {p.name}
          </Button>
        </CardTitle>
        <CardDescription className="truncate text-meta" title={p.path}>
          {p.exists ? p.path : `Папку не знайдено: ${p.path}`}
        </CardDescription>
        <CardAction>
          <Toggle
            size="sm"
            pressed={p.favorite}
            onPressedChange={(favorite) => update.mutate({ id: p.id, patch: { favorite } })}
            aria-label="Обране"
            className="size-8 min-w-8 rounded-full p-0 text-muted-foreground on:bg-transparent on:text-warn"
          >
            <Star className={cn(p.favorite && 'fill-current')} />
          </Toggle>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {p.framework && <Badge variant="ink">{p.framework}</Badge>}
          {p.packageManager && <Badge variant="outline">{p.packageManager}</Badge>}
          {p.git?.branch && (
            <Badge variant="soft" className="bg-card">
              <GitBranch /> {p.git.branch}
            </Badge>
          )}
          {!!p.git?.dirty && <Badge variant="warn">{p.git.dirty} змін.</Badge>}
          {!!p.git?.ahead && <Badge variant="info">↑{p.git.ahead}</Badge>}
          {!!p.git?.behind && <Badge variant="info">↓{p.git.behind}</Badge>}
          {!p.framework && !p.packageManager && !p.git && (
            <span className="text-caption text-muted-foreground">Не git-репозиторій, package.json не знайдено</span>
          )}
          {p.githubRepo && (
            <Button variant="link" size="xs" className="h-6 px-0 text-meta text-muted-foreground" onClick={() => openUrl(`https://github.com/${p.githubRepo}`)}>
              {p.githubRepo}
            </Button>
          )}
        </div>
        {p.git?.lastCommit && (
          <p className="truncate text-caption text-muted-foreground" title={p.git.lastCommit.message}>
            <span className="text-foreground">{p.git.lastCommit.message}</span> · {fmtRelative(p.git.lastCommit.at)}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <ButtonGroup>
            {/* Card actions stay neutral (subtle): the only lime on this screen is "Добавить папку". */}
            <Button size="sm" variant="subtle" disabled={!p.exists} onClick={() => open.mutate({ projectId: p.id, target: p.editor })}>
              <Code2 /> {EDITOR_LABEL[p.editor]}
            </Button>
            <ButtonGroupSeparator className="bg-foreground/10" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="subtle" disabled={!p.exists} aria-label="Відкрити в…">
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => open.mutate({ projectId: p.id, target: 'vscode' })}>
                  <Code2 /> VS Code
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => open.mutate({ projectId: p.id, target: 'cursor' })}>
                  <Zap /> Cursor
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => open.mutate({ projectId: p.id, target: 'terminal' })}>
                  <TerminalSquare /> Термінал
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => open.mutate({ projectId: p.id, target: 'folder' })}>
                  <FolderOpen /> Папка
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>

          {mainRun ? (
            <Button size="sm" variant="outline" onClick={() => stop.mutate(mainRun.runId)}>
              <Square /> Зупинити {mainRun.script}
            </Button>
          ) : (
            main && (
              <Button size="sm" variant="subtle" disabled={!p.exists || run.isPending} onClick={() => run.mutate({ projectId: p.id, script: main })}>
                <Play className="text-success" /> {main}
              </Button>
            )
          )}

          {scripts.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="subtle" disabled={!p.exists}>
                  Скрипти <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
                <DropdownMenuLabel>package.json</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {scripts.map((s) => {
                  const r = running.find((x) => x.script === s)
                  return (
                    <DropdownMenuItem
                      key={s}
                      onSelect={() => (r ? stop.mutate(r.runId) : run.mutate({ projectId: p.id, script: s }))}
                      title={p.scripts[s]}
                    >
                      {r ? <Square /> : <Play />}
                      <span className="flex-1 truncate">{s}</span>
                      <span className="max-w-28 truncate font-mono text-meta text-muted-foreground">{p.scripts[s]}</span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {url && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={() => openUrl(url)}>
                  <ExternalLink /> {url.replace(/^https?:\/\//, '')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Відкрити в браузері</TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
