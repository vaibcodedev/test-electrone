import type { ReactElement } from 'react'
import { RefreshCw } from 'lucide-react'
import type { Settings, UpdateStatus } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { SettingsRow, SettingsSection } from './section'

/** One line under «Завантажувати оновлення автоматично» per updater state; none for idle / checking. */
function hintOf(status: UpdateStatus | undefined): string | undefined {
  switch (status?.state) {
    case 'disabled':
      return status.reason
    case 'ready':
      return `Версія ${status.version} готова до встановлення`
    case 'downloading':
      return `Завантаження ${status.percent}%`
    case 'error':
      // The updater's own message is English and technical, so it is not shown here.
      return 'Не вдалося перевірити оновлення. Перевірте інтернет і натисніть «Перевірити».'
    case 'none':
      return 'У вас остання версія'
    case 'available':
      return `Доступна версія ${status.version}`
    default:
      return undefined
  }
}

/** «Оновлення»: auto-download switch, current state, manual check. Installing lives on the sidebar plate too. */
export function UpdatesSection({ settings, set }: { settings: Settings; set: (patch: Partial<Settings>) => void }): ReactElement {
  const { data: update } = useApi('updates', 'status')
  const check = useApiMutation('updates', 'check')
  const install = useApiMutation('updates', 'install')

  return (
    <SettingsSection
      id="updates"
      title="Оновлення"
      hint="Vault сам перевіряє нові версії й ставить їх після перезапуску. Дані під час оновлення не чіпаються."
    >
      <SettingsRow label="Завантажувати оновлення автоматично" hint={hintOf(update)}>
        {(id) => <Switch id={id} checked={settings.autoUpdate} onCheckedChange={(autoUpdate) => set({ autoUpdate })} />}
      </SettingsRow>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" disabled={update?.state === 'disabled' || check.isPending} onClick={() => check.mutate(undefined)}>
          <RefreshCw className={cn(check.isPending && 'animate-spin')} /> Перевірити
        </Button>
        {(update?.state === 'ready' || update?.state === 'available') && (
          // Soft, not lime: the sidebar plate already carries this action on every screen.
          <Button variant="soft" disabled={install.isPending} onClick={() => install.mutate(undefined)}>
            {update.state === 'ready' ? 'Перезапустити й оновити' : 'Завантажити оновлення'}
          </Button>
        )}
      </div>
    </SettingsSection>
  )
}
