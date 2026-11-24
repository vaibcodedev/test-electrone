import { useState, type ReactNode } from 'react'
import {
  Archive,
  Download,
  FileJson,
  FileText,
  FolderOpen,
  HardDrive,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun
} from 'lucide-react'
import { toast } from 'sonner'
import type { Settings, Theme } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtBytes, fmtDateTime, fmtRelative } from '@/lib/format'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { ExtensionSettingsCard, GithubSettingsCard } from '@/modules/dev/settings-cards'

/** Settings section: shadcn Card with header and a column of rows. */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-[15px] text-foreground">{title}</CardTitle>
        {hint && <CardDescription className="text-[12.5px]">{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">{children}</CardContent>
    </Card>
  )
}

/** One setting: title/description on the left, control on the right (shadcn Item). */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Item size="sm" className="bg-card">
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate text-[13.5px] font-normal">{label}</ItemTitle>
        {hint && <ItemDescription className="text-[12px]">{hint}</ItemDescription>}
      </ItemContent>
      <ItemActions>{children}</ItemActions>
    </Item>
  )
}

/** Records a key combination as an Electron accelerator string. */
function ShortcutInput({ value, onChange }: { value: string; onChange: (accel: string) => void }) {
  const [recording, setRecording] = useState(false)
  const keys = value.replace('CommandOrControl', 'Ctrl').split('+')
  return (
    <Button
      variant={recording ? 'lime' : 'outline'}
      size="sm"
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return
        e.preventDefault()
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
        if (e.key === 'Escape') return setRecording(false)
        const parts = [
          e.ctrlKey || e.metaKey ? 'CommandOrControl' : null,
          e.altKey ? 'Alt' : null,
          e.shiftKey ? 'Shift' : null
        ].filter(Boolean)
        if (!parts.length) return toast.error('Нужен хотя бы один модификатор: Ctrl, Alt или Shift')
        const key =
          e.code === 'Space'
            ? 'Space'
            : e.code.startsWith('Key')
              ? e.code.slice(3)
              : e.code.startsWith('Digit')
                ? e.code.slice(5)
                : e.key.length === 1
                  ? e.key.toUpperCase()
                  : e.key
        onChange([...parts, key].join('+'))
        setRecording(false)
      }}
    >
      {recording ? (
        'Нажмите сочетание…'
      ) : (
        <KbdGroup>
          {keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </KbdGroup>
      )}
    </Button>
  )
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Светлая', icon: Sun },
  { value: 'dark', label: 'Тёмная', icon: Moon },
  { value: 'system', label: 'Как в системе', icon: Monitor }
]

export function SettingsPage() {
  const { data: settings } = useApi('settings', 'get')
  const { data: info } = useApi('settings', 'info')
  const { data: backups = [] } = useApi('backup', 'list')
  const { data: update } = useApi('updates', 'status')
  const save = useApiMutation('settings', 'update')
  const createBackup = useApiMutation('backup', 'create')
  const checkUpdates = useApiMutation('updates', 'check')
  const [busy, setBusy] = useState<string | null>(null)

  if (!settings) return null
  const set = (patch: Partial<Settings>): void => save.mutate(patch)

  const run = async (key: string, fn: () => Promise<unknown>, done?: (r: unknown) => void): Promise<void> => {
    setBusy(key)
    try {
      const r = await fn()
      done?.(r)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const updateHint =
    update?.state === 'disabled'
      ? update.reason
      : update?.state === 'ready'
        ? `Версия ${update.version} готова к установке`
        : update?.state === 'downloading'
          ? `Загрузка ${update.percent}%`
          : update?.state === 'error'
            ? `Ошибка: ${update.message}`
            : update?.state === 'none'
              ? 'У вас последняя версия'
              : update?.state === 'available'
                ? `Доступна версия ${update.version}`
                : undefined

  return (
    <Page>
      <PageHeader title="Настройки" subtitle={info ? `Vault ${info.version}` : undefined} />
      <PageBody className="max-w-4xl">
        <div className="flex flex-col gap-3">
          <Section title="Вы" hint="Имя показывается в приветствии.">
            <Row label="Как к вам обращаться">
              <Input
                key={settings.userName}
                defaultValue={settings.userName}
                placeholder="Имя"
                onBlur={(e) => e.target.value !== settings.userName && set({ userName: e.target.value })}
                className="w-56 bg-surface"
              />
            </Row>
          </Section>

          <Section title="Оформление">
            <RadioGroup
              value={settings.theme}
              onValueChange={(v) => set({ theme: v as Theme })}
              className="grid grid-cols-3 gap-2"
            >
              {THEMES.map((t) => {
                const active = settings.theme === t.value
                return (
                  <Label
                    key={t.value}
                    htmlFor={`theme-${t.value}`}
                    className={cn(
                      'flex h-20 flex-col items-start justify-between rounded-2xl p-3 text-[13px] font-normal transition-colors',
                      active ? 'bg-ink text-ink-foreground' : 'bg-card text-foreground hover:bg-accent'
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <t.icon className={cn('size-4', active && 'text-ink-accent')} />
                      <RadioGroupItem value={t.value} id={`theme-${t.value}`} className="sr-only" />
                    </span>
                    {t.label}
                  </Label>
                )
              })}
            </RadioGroup>
          </Section>

          <Section title="Система" hint="Vault живёт в трее и ловит быстрые мысли из любого окна.">
            <Row label="Быстрое добавление" hint="Глобальное сочетание, работает даже когда окно свёрнуто">
              <ShortcutInput value={settings.quickAddShortcut} onChange={(quickAddShortcut) => set({ quickAddShortcut })} />
            </Row>
            <Row label="Запускать вместе с Windows" hint="Работает в установленной версии">
              <Switch checked={settings.launchAtLogin} onCheckedChange={(launchAtLogin) => set({ launchAtLogin })} />
            </Row>
            <Row label="Стартовать свёрнутым в трей" hint="При автозапуске окно не открывается">
              <Switch checked={settings.startHidden} onCheckedChange={(startHidden) => set({ startHidden })} />
            </Row>
            <Row label="Закрытие окна сворачивает в трей" hint="Выйти полностью — через меню иконки в трее">
              <Switch checked={settings.closeToTray} onCheckedChange={(closeToTray) => set({ closeToTray })} />
            </Row>
            <Row label="Вечернее напоминание о площадках" hint="Поиск работы: если сегодня не отмечены площадки. Пусто — выключено">
              <Input
                type="time"
                defaultValue={settings.jobReminderTime}
                onBlur={(e) => e.target.value !== settings.jobReminderTime && set({ jobReminderTime: e.target.value })}
                className="w-28 bg-card"
              />
            </Row>
          </Section>

          <Section title="Данные" hint="База и файлы лежат в одной папке. В базе хранятся только пути к картинкам.">
            {info && (
              <Row label={info.dataDir} hint={`База ${fmtBytes(info.dbSizeBytes)}`}>
                <Button variant="soft" size="sm" onClick={() => api.settings.openDataDir()}>
                  <FolderOpen /> Открыть папку
                </Button>
              </Row>
            )}
            {info && (
              <Row label="Журнал ошибок" hint={info.logFile}>
                <Button variant="soft" size="sm" onClick={() => api.settings.openLogs()}>
                  <FolderOpen /> Открыть журнал
                </Button>
              </Row>
            )}
          </Section>

          <Section
            title="Бэкап"
            hint="Один файл .vaultbak: база + все картинки и файлы. Автобэкап раз в день, хранятся последние копии."
          >
            <Row
              label="Автобэкап раз в день"
              hint={info?.lastBackupAt ? `Последний: ${fmtRelative(info.lastBackupAt)}` : 'Ещё не делался'}
            >
              <Switch checked={settings.autoBackup} onCheckedChange={(autoBackup) => set({ autoBackup })} />
            </Row>
            <Row label="Сколько копий хранить">
              <Input
                type="number"
                min={1}
                max={100}
                key={settings.backupKeep}
                defaultValue={settings.backupKeep}
                onBlur={(e) => set({ backupKeep: Math.max(1, Math.min(100, Number(e.target.value) || 14)) })}
                className="w-20 bg-surface"
              />
            </Row>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="lime"
                disabled={!!busy}
                onClick={() => run('backup', () => createBackup.mutateAsync({ saveAs: false }), () => toast.success('Бэкап создан'))}
              >
                <Archive /> Сделать бэкап сейчас
              </Button>
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  run('backup-as', () => createBackup.mutateAsync({ saveAs: true }), (r) => r && toast.success('Бэкап сохранён'))
                }
              >
                <Download /> Сохранить бэкап как…
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => run('restore', () => api.backup.restore({}))}>
                <RotateCcw /> Восстановить из файла…
              </Button>
            </div>
            {backups.length > 0 && (
              <Table className="mt-1 text-[12.5px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Файл</TableHead>
                    <TableHead className="text-right">Размер</TableHead>
                    <TableHead className="text-right">Создан</TableHead>
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
                      <TableCell className="w-20 text-right text-muted-foreground">{fmtBytes(b.size)}</TableCell>
                      <TableCell className="w-32 text-right text-muted-foreground">{fmtDateTime(b.createdAt)}</TableCell>
                      <TableCell className="w-28 text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={!!busy}
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => run('restore', () => api.backup.restore({ path: b.path }))}
                        >
                          Восстановить
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>

          <Section title="Экспорт" hint="Данные никогда не заперты в приложении: всё выгружается в открытые форматы.">
            <ItemGroup className="gap-2">
              <Item size="sm" className="bg-card">
                <ItemMedia variant="icon">
                  <FileText />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-normal">Markdown</ItemTitle>
                  <ItemDescription className="text-[12px]">Zip: папка на раздел, файл на запись, картинки рядом</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => run('md', () => api.backup.export('markdown'), (p) => p && toast.success('Экспортировано в Markdown'))}
                  >
                    Экспорт
                  </Button>
                </ItemActions>
              </Item>
              <Item size="sm" className="bg-card">
                <ItemMedia variant="icon">
                  <FileJson />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-normal">JSON</ItemTitle>
                  <ItemDescription className="text-[12px]">Один файл со всеми таблицами</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => run('json', () => api.backup.export('json'), (p) => p && toast.success('Экспортировано в JSON'))}
                  >
                    Экспорт
                  </Button>
                </ItemActions>
              </Item>
            </ItemGroup>
            <p className="text-[12px] text-muted-foreground">
              Пароли из «Доступов» в экспорт не попадают — они зашифрованы ключом Windows и расшифровываются только на этом
              компьютере.
            </p>
          </Section>

          <GithubSettingsCard />
          <ExtensionSettingsCard />

          <Section title="Обновления" hint="Через GitHub Releases (настраивается в electron-builder.yml).">
            <Row label="Скачивать обновления автоматически" hint={updateHint}>
              <Switch checked={settings.autoUpdate} onCheckedChange={(autoUpdate) => set({ autoUpdate })} />
            </Row>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                disabled={update?.state === 'disabled' || checkUpdates.isPending}
                onClick={() => checkUpdates.mutate(undefined)}
              >
                <RefreshCw className={cn(checkUpdates.isPending && 'animate-spin')} /> Проверить
              </Button>
              {(update?.state === 'ready' || update?.state === 'available') && (
                <Button variant="lime" onClick={() => api.updates.install()}>
                  {update.state === 'ready' ? 'Перезапустить и обновить' : 'Скачать обновление'}
                </Button>
              )}
            </div>
          </Section>
        </div>
      </PageBody>
    </Page>
  )
}
