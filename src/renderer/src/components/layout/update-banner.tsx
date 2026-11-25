import { ArrowDownToLine, RefreshCw, Sparkles } from 'lucide-react'
import { useApi, useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

/**
 * Update plate above the sidebar footer: visible from every screen, not only in Settings.
 * An ink card (balances the lime greeting card at the top of the sidebar); only its button is lime:
 * downloading → progress; downloaded → «Перезапустити й оновити»; found, auto-download off → «Завантажити».
 * Nothing for the other states, so it never takes room for nothing.
 */
export function UpdateBanner() {
  const { data: s } = useApi('updates', 'status')
  const install = useApiMutation('updates', 'install')
  if (!s || (s.state !== 'downloading' && s.state !== 'ready' && s.state !== 'available')) return null

  const downloading = s.state === 'downloading'
  const ready = s.state === 'ready'
  const Icon = downloading ? ArrowDownToLine : ready ? Sparkles : ArrowDownToLine
  return (
    <Card className="mx-2 mb-2 animate-enter gap-3 rounded-[22px] bg-ink p-3 text-ink-foreground" role="status">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-foreground/10 text-ink-accent">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-caption font-semibold">
            {downloading ? 'Оновлення' : ready ? 'Оновлення готове' : 'Є нова версія'}
          </div>
          <div className="truncate text-meta text-ink-muted">
            {downloading ? `Завантажується · ${s.percent}%` : `Vault ${s.version}`}
          </div>
        </div>
      </div>
      {downloading ? (
        <Progress
          value={s.percent}
          aria-label="Завантаження оновлення"
          className="h-1.5 bg-ink-foreground/15 [&>[data-slot=progress-indicator]]:bg-lime"
        />
      ) : (
        <Button variant="lime" size="sm" className="w-full" disabled={install.isPending} onClick={() => install.mutate(undefined)}>
          {ready ? <RefreshCw /> : <ArrowDownToLine />}
          {ready ? 'Перезапустити й оновити' : 'Завантажити'}
        </Button>
      )}
    </Card>
  )
}
