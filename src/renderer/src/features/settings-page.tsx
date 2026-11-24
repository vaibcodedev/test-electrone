import { useState, type ReactNode } from 'react'
import { Archive, Download, FileJson, FileText, FolderOpen, HardDrive, Monitor, Moon, RefreshCw, RotateCcw, Sun } from 'lucide-react'
import { toast } from 'sonner'
import type { Settings, Theme } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtBytes, fmtDateTime, fmtRelative } from '@/lib/format'
import { Page, PageBody, PageHeader, Kbd } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[240px_1fr] gap-8 border-t border-border py-6 first:border-t-0">
      <div>
        <h2 className="text-[15px] font-medium">{title}</h2>
        {hint && <p className="mt-1 text-[12.5px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-2xl bg-surface px-4 py-3">
      <div>
        <div className="text-[13.5px]">{label}</div>
        {hint && <div className="text-[12px] text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

/** Records a key combination as an Electron accelerator string. */
function ShortcutInput({ value, onChange }: { value: string; onChange: (accel: string) => void }) {
  const [recording, setRecording] = useState(false)
  const label = value.replace('CommandOrControl', 'Ctrl').split('+')
  return (
    <button
      type="button"
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return
        e.preventDefault()
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
        if (e.key === 'Escape') return setRecording(false)
        const parts = [e.ctrlKey || e.metaKey ? 'CommandOrControl' : null, e.altKey ? 'Alt' : null, e.shiftKey ? 'Shift' : null].filter(Boolean)
        if (!parts.length) return toast.error('Нужен хотя бы один модификатор: Ctrl, Alt или Shift')
        const key = e.code === 'Space' ? 'Space' : e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key
        onChange([...parts, key].join('+'))
        setRecording(false)
      }}
      className={cn(
        'flex h-9 items-center gap-1 rounded-full px-3 ring-1 ring-border',
        recording ? 'bg-lime-soft ring-ring' : 'bg-card'
      )}
    >
      {recording ? (
        <span className="text-[12.5px] text-muted-foreground">Нажмите сочетание…</span>
      ) : (
        label.map((k) => <Kbd key={k}>{k}</Kbd>)
      )}
    </button>
  )
}

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

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Светлая', icon: Sun },
    { value: 'dark', label: 'Тёмная', icon: Moon },
    { value: 'system', label: 'Как в системе', icon: Monitor }
  ]

  return (
    <Page>
      <PageHeader title="Настройки" subtitle={info ? `Vault ${info.version}` : undefined} />
      <PageBody className="max-w-5xl">
        <Section title="Вы" hint="Имя показывается в приветствии.">
          <Input
            defaultValue={settings.userName}
            placeholder="Как к вам обращаться"
            onBlur={(e) => e.target.value !== settings.userName && set({ userName: e.target.value })}
            className="max-w-sm"
          />
        </Section>

        <Section title="Оформление">
          <div className="flex gap-2">
            {themes.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => set({ theme: t.value })}
                className={cn(
                  'flex h-20 w-36 flex-col justify-between rounded-2xl p-3 text-left text-[13px] transition-colors',
                  settings.theme === t.value ? 'bg-ink text-ink-foreground' : 'bg-surface hover:bg-accent'
                )}
              >
                <t.icon className={cn('size-4', settings.theme === t.value && 'text-lime')} />
                {t.label}
              </button>
            ))}
          </div>
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
        </Section>

        <Section title="Данные" hint="База и файлы лежат в одной папке. В базе хранятся только пути к картинкам.">
          {info && (
            <Row label={info.dataDir} hint={`База ${fmtBytes(info.dbSizeBytes)}`}>
              <Button variant="soft" size="sm" onClick={() => api.settings.openDataDir()}>
                <FolderOpen /> Открыть папку
              </Button>
            </Row>
          )}
        </Section>

        <Section
          title="Бэкап"
          hint="Один файл .vaultbak: база + все картинки и файлы. Автобэкап раз в сутки, хранятся последние копии."
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
              defaultValue={settings.backupKeep}
              onBlur={(e) => set({ backupKeep: Math.max(1, Math.min(100, Number(e.target.value) || 14)) })}
              className="w-20 bg-card"
            />
          </Row>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="lime"
              disabled={!!busy}
              onClick={() => run('backup', () => createBackup.mutateAsync({ saveAs: false }), () => toast.success('Бэкап создан'))}
            >
              <Archive /> Сделать бэкап сейчас
            </Button>
            <Button
              variant="soft"
              disabled={!!busy}
              onClick={() => run('backup-as', () => createBackup.mutateAsync({ saveAs: true }), (r) => r && toast.success('Бэкап сохранён'))}
            >
              <Download /> Сохранить бэкап как…
            </Button>
            <Button variant="soft" disabled={!!busy} onClick={() => run('restore', () => api.backup.restore({}))}>
              <RotateCcw /> Восстановить из файла…
            </Button>
          </div>
          {backups.length > 0 && (
            <ul className="flex flex-col gap-1">
              {backups.slice(0, 8).map((b) => (
                <li key={b.path} className="group flex items-center gap-3 rounded-xl px-3 py-2 text-[12.5px] hover:bg-surface">
                  <HardDrive className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{b.fileName}</span>
                  <span className="text-muted-foreground">{fmtBytes(b.size)}</span>
                  <span className="w-32 text-right text-muted-foreground">{fmtDateTime(b.createdAt)}</span>
                  <button
                    type="button"
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                    onClick={() => run('restore', () => api.backup.restore({ path: b.path }))}
                  >
                    Восстановить
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Экспорт" hint="Данные никогда не заперты в приложении: всё выгружается в открытые форматы.">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="soft"
              disabled={!!busy}
              onClick={() => run('md', () => api.backup.export('markdown'), (p) => p && toast.success('Экспортировано в Markdown'))}
            >
              <FileText /> Markdown (.zip)
            </Button>
            <Button
              variant="soft"
              disabled={!!busy}
              onClick={() => run('json', () => api.backup.export('json'), (p) => p && toast.success('Экспортировано в JSON'))}
            >
              <FileJson /> JSON (один файл)
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Пароли из «Доступов» в экспорт не попадают — они зашифрованы ключом Windows и расшифровываются только на этом компьютере.
          </p>
        </Section>

        <Section title="Обновления" hint="Через GitHub Releases (настраивается в electron-builder.yml).">
          <Row
            label="Скачивать обновления автоматически"
            hint={
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
                        : undefined
            }
          >
            <Switch checked={settings.autoUpdate} onCheckedChange={(autoUpdate) => set({ autoUpdate })} />
          </Row>
          <div className="flex gap-2">
            <Button variant="soft" disabled={update?.state === 'disabled' || checkUpdates.isPending} onClick={() => checkUpdates.mutate(undefined)}>
              <RefreshCw className={cn(checkUpdates.isPending && 'animate-spin')} /> Проверить
            </Button>
            {(update?.state === 'ready' || update?.state === 'available') && (
              <Button variant="lime" onClick={() => api.updates.install()}>
                {update.state === 'ready' ? 'Перезапустить и обновить' : 'Скачать обновление'}
              </Button>
            )}
          </div>
        </Section>
      </PageBody>
    </Page>
  )
}
