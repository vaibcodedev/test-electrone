import { useEffect, useState, type ReactElement } from 'react'
import { format } from 'date-fns'
import { Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import type { RunningTimer } from '@shared/domain/crm'
import { useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupInput } from '@/components/ui/input-group'
import { DESC_MAX } from './time-range'

function useElapsed(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [startedAt])
  return startedAt ? Math.max(0, now - startedAt) : 0
}

function Clock({ ms }: { ms: number }): ReactElement {
  const s = Math.floor(ms / 1000)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return (
    <span className="font-display text-stat-sm leading-none tabular-nums">
      {hh}:{mm}
      <span className="text-muted-foreground">:{ss}</span>
    </span>
  )
}

/** Running timer: calm raised bar, elapsed clock, inline-editable description saved to the entry. */
export function RunningBar({ running }: { running: RunningTimer }): ReactElement {
  const elapsed = useElapsed(running.startedAt)
  const update = useApiMutation('time', 'update', { silent: true })
  // The server drops a timer stopped in under a minute and returns null.
  const stop = useApiMutation('time', 'stop', {
    onSuccess: (entry) =>
      entry ? toast.success('Час записано') : toast.info('Менше хвилини — запис не збережено')
  })
  const [description, setDescription] = useAutosave(running.description, (v) =>
    update.mutate({ id: running.id, patch: { description: v.trim() } })
  )
  return (
    <Card className="flex-row items-center gap-4 bg-card px-5 py-3.5 ring-1 ring-foreground/10">
      <span
        className="size-2 shrink-0 animate-pulse rounded-full bg-lime"
        aria-label="Таймер іде"
      />
      <div className="flex shrink-0 flex-col gap-1">
        <Clock ms={elapsed} />
        <span className="text-meta text-muted-foreground tabular-nums">
          з {format(running.startedAt, 'HH:mm')}
        </span>
      </div>
      <Input
        value={description}
        maxLength={DESC_MAX}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Що робите? Можна дописати на ходу"
        aria-label="Опис поточної роботи"
        className="min-w-0 flex-1"
      />
      {/* A double click must not stop twice («Час записано» + «Менше хвилини…»). */}
      <Button
        variant="outline"
        disabled={stop.isPending}
        onClick={() => !stop.isPending && stop.mutate(undefined)}
      >
        <Square className="fill-current" /> Зупинити
      </Button>
    </Card>
  )
}

/** Idle: one input + «Почати» (Enter starts); recent descriptions as quick-start chips. */
export function StartBar({
  projectId,
  recent,
  otherRunning
}: {
  projectId: string
  recent: string[]
  otherRunning?: RunningTimer | null
}): ReactElement {
  const [description, setDescription] = useState('')
  const start = useApiMutation('time', 'start', { onSuccess: () => setDescription('') })
  const go = (text: string): void => {
    if (start.isPending) return
    start.mutate({ projectId, description: text.trim() || undefined })
  }
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          go(description)
        }}
      >
        <InputGroup className="flex-1">
          <InputGroupInput
            value={description}
            maxLength={DESC_MAX}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Над чим працюєте?"
            aria-label="Над чим працюєте"
          />
        </InputGroup>
        {/* lime, not default: while the project is edited, CSS turns it soft (one accent — «Зберегти»). */}
        <Button type="submit" variant="lime" disabled={start.isPending}>
          <Play className="fill-current" /> Почати
        </Button>
      </form>
      {(recent.length > 0 || otherRunning) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {recent.map((r) => (
            <Button key={r} variant="soft" size="xs" className="max-w-56" onClick={() => go(r)}>
              <Play className="size-3" />
              <span className="truncate">{r}</span>
            </Button>
          ))}
          {otherRunning && (
            <span className="text-caption text-muted-foreground">
              Зараз іде таймер у «{otherRunning.projectTitle}» — його буде зупинено
            </span>
          )}
        </div>
      )}
    </div>
  )
}
