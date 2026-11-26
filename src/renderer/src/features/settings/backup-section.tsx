import type { ReactElement } from 'react'
import { Archive, Download, HardDrive, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { settingsSchema, type AppInfo, type Settings } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtBytes, fmtDateTime, fmtRelative } from '@/lib/format'
import { rangesOf } from '@/lib/limits'
import { NumberInput } from '@/components/common/number-input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { SettingsRow, SettingsSection } from './section'
import { BackupFolderRows } from './backup-folder-rows'

const RANGES = rangesOf(settingsSchema)

/** «Бекап»: daily auto-backup, how many to keep, backup now / save as / restore, and the recent files. */
export function BackupSection({
  settings,
  info,
  set
}: {
  settings: Settings
  info: AppInfo | undefined
  set: (patch: Partial<Settings>) => void
}): ReactElement {
  const { data: backups = [] } = useApi('backup', 'list')
  const create = useApiMutation('backup', 'create')
  const restore = useApiMutation('backup', 'restore')
  const busy = create.isPending || restore.isPending

  return (
    <SettingsSection
      id="backup"
      title="Бекап"
      hint="Один файл .vaultbak: база + усі картинки й файли. Автобекап раз на день, зберігаються останні копії."
    >
      <SettingsRow
        label="Автобекап раз на день"
        hint={info?.lastBackupAt ? `Останній: ${fmtRelative(info.lastBackupAt)}` : 'Ще не робився'}
      >
        {(id) => (
          <Switch
            id={id}
            checked={settings.autoBackup}
            onCheckedChange={(autoBackup) => set({ autoBackup })}
          />
        )}
      </SettingsRow>
      <SettingsRow label="Скільки копій зберігати в папці Vault">
        {(id) => (
          <NumberInput
            id={id}
            integer
            min={RANGES.backupKeep?.min}
            max={RANGES.backupKeep?.max}
            value={settings.backupKeep}
            onChange={(v) => v !== null && set({ backupKeep: v })}
            className="w-20"
          />
        )}
      </SettingsRow>
      <BackupFolderRows settings={settings} set={set} />
      <div className="flex flex-wrap gap-2 pt-1">
        {/* subtle, not lime: settings have no main action, and the screen keeps one accent (§1). */}
        <Button
          variant="subtle"
          disabled={busy}
          onClick={() =>
            create.mutate(
              { saveAs: false },
              { onSuccess: (r) => r && toast.success('Бекап створено') }
            )
          }
        >
          <Archive /> Зробити бекап зараз
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            create.mutate(
              { saveAs: true },
              { onSuccess: (r) => r && toast.success('Бекап збережено') }
            )
          }
        >
          <Download /> Зберегти у файл
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => restore.mutate({})}>
          <RotateCcw /> Відновити з файлу
        </Button>
      </div>
      {backups.length > 0 && (
        <Table className="mt-1 text-caption">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Файл</TableHead>
              <TableHead className="text-right">Розмір</TableHead>
              <TableHead className="text-right">Створено</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {backups.slice(0, 8).map((b) => (
              <TableRow key={b.path} className="group">
                <TableCell className="max-w-0 truncate">
                  <span className="flex items-center gap-2">
                    <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{b.fileName}</span>
                  </span>
                </TableCell>
                <TableCell className="w-20 text-right text-muted-foreground">
                  {fmtBytes(b.size)}
                </TableCell>
                <TableCell className="w-32 text-right text-muted-foreground">
                  {fmtDateTime(b.createdAt)}
                </TableCell>
                <TableCell className="w-28 text-right">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => restore.mutate({ path: b.path })}
                  >
                    Відновити
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SettingsSection>
  )
}
