import type { ReactElement, ReactNode } from 'react'
import { FolderInput, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { settingsSchema, type BackupFolderInfo, type Settings } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtRelative } from '@/lib/format'
import { rangesOf } from '@/lib/limits'
import { IconAction } from '@/components/common/icon-action'
import { NumberInput } from '@/components/common/number-input'
import { Button } from '@/components/ui/button'
import { SettingsRow } from './section'

const RANGES = rangesOf(settingsSchema)

/** Second line of the folder row: the last good copy, or why the last attempt failed (newer than the good one). */
function folderStatus(f: BackupFolderInfo): ReactNode {
  if (f.lastError && f.lastError.at > (f.lastOkAt ?? 0))
    return (
      <span data-folder-error className="block text-destructive">
        Не вдалося {fmtRelative(f.lastError.at)}: {f.lastError.message}
      </span>
    )
  if (f.lastOkAt) return <span className="block">Остання перевірена копія: {fmtRelative(f.lastOkAt)}</span>
  return <span className="block">Копій тут ще немає — перша з’явиться з найближчим бекапом.</span>
}

/**
 * «Папка для копій»: a second copy of every daily backup on another disk or in a synced cloud folder. The path is
 * picked by main's own dialog (the renderer never sends one); «Не копіювати» goes back to Vault's own folder only.
 */
export function BackupFolderRows({
  settings,
  set
}: {
  settings: Settings
  set: (patch: Partial<Settings>) => void
}): ReactElement | null {
  const { data: folder } = useApi('backup', 'folder')
  const choose = useApiMutation('backup', 'chooseFolder', {
    onSuccess: (f) => f && toast.success('Папку для копій вибрано')
  })
  const reset = useApiMutation('backup', 'resetFolder', {
    successMessage: 'Копії в окрему папку вимкнено — бекапи лише в папці Vault'
  })
  const open = useApiMutation('backup', 'openFolder')
  if (!folder) return null
  const busy = choose.isPending || reset.isPending

  if (!folder.enabled)
    return (
      <SettingsRow label="Папка для копій" hint="У тестовому режимі копії в окрему папку вимкнено.">
        <Button variant="soft" size="sm" disabled>
          <FolderInput /> Вибрати папку
        </Button>
      </SettingsRow>
    )

  if (!folder.path)
    return (
      <SettingsRow
        label="Папка для копій"
        hint="Друга копія кожного бекапу — на іншому диску або в папці OneDrive чи Google Drive. Зараз бекапи лише в папці Vault."
      >
        <Button variant="soft" size="sm" disabled={busy} onClick={() => choose.mutate(undefined)}>
          <FolderInput /> Вибрати папку
        </Button>
      </SettingsRow>
    )

  return (
    <>
      <SettingsRow
        label="Папка для копій"
        hint={
          <>
            <span className="block truncate font-mono" title={folder.path}>
              {folder.path}
            </span>
            {folderStatus(folder)}
          </>
        }
      >
        <div className="flex items-center gap-2">
          <IconAction label="Відкрити папку" size="icon-sm" onClick={() => open.mutate(undefined)}>
            <FolderOpen />
          </IconAction>
          <Button variant="soft" size="sm" disabled={busy} onClick={() => choose.mutate(undefined)}>
            Змінити
          </Button>
          <Button variant="soft" size="sm" disabled={busy} onClick={() => reset.mutate(undefined)}>
            Не копіювати
          </Button>
        </div>
      </SettingsRow>
      <SettingsRow label="Скільки копій тримати в папці" hint="Лише копії з цього комп’ютера; старіші видаляються.">
        {(id) => (
          <NumberInput
            id={id}
            integer
            min={RANGES.backupFolderKeep?.min}
            max={RANGES.backupFolderKeep?.max}
            value={settings.backupFolderKeep}
            onChange={(v) => v !== null && set({ backupFolderKeep: v })}
            className="w-20"
          />
        )}
      </SettingsRow>
    </>
  )
}
