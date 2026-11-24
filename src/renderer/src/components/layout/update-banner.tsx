import { Download, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useApi } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

/**
 * Update plate above the sidebar footer: visible from every screen, not only in Settings.
 * Downloading → progress; downloaded → «Перезапустити»; found but not downloaded (auto-download off) →
 * «Завантажити». Nothing for the other states, so it never takes room for nothing.
 */
export function UpdateBanner() {
  const { data: s } = useApi('updates', 'status')
  if (!s || (s.state !== 'downloading' && s.state !== 'ready' && s.state !== 'available')) return null

  if (s.state === 'downloading')
    return (
      <Card className="mx-2 mb-2 gap-2 bg-sidebar-accent px-3 py-2.5" role="status">
        <div className="flex items-center gap-2 text-caption font-medium">
          <Download className="size-3.5 text-muted-foreground" />
          <span className="flex-1">Завантажую оновлення</span>
          <span className="text-muted-foreground tabular-nums">{s.percent}%</span>
        </div>
        <Progress value={s.percent} aria-label="Завантаження оновлення" className="h-1 bg-foreground/10 [&>[data-slot=progress-indicator]]:bg-chart-1" />
      </Card>
    )

  const ready = s.state === 'ready'
  return (
    <Card className="mx-2 mb-2 animate-enter gap-2 bg-lime-soft px-3 py-2.5" role="status">
      <div className="min-w-0">
        <div className="text-caption font-semibold">{ready ? 'Оновлення готове' : 'Є оновлення'}</div>
        <div className="truncate text-meta text-muted-foreground">Версія {s.version}</div>
      </div>
      <Button variant="lime" size="sm" className="w-full" onClick={() => void api.updates.install()}>
        {ready ? <RefreshCw /> : <Download />}
        {ready ? 'Перезапустити й оновити' : 'Завантажити'}
      </Button>
    </Card>
  )
}
