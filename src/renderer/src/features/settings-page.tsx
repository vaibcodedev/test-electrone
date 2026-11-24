import { useState, type ReactNode } from 'react'
import { Archive, Check, Download, FileJson, FileText, FolderOpen, HardDrive, Monitor, Moon, RefreshCw, RotateCcw, Sun } from 'lucide-react'
import { toast } from 'sonner'
import type { Settings, Theme } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtBytes, fmtDateTime, fmtRelative } from '@/lib/format'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/common/number-input'
import { Switch } from '@/components/ui/switch'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { limitsOf } from '@/lib/limits'
import { settingsSchema } from '@shared/domain/system'
import { ExtensionSettingsCard, GithubSettingsCard } from '@/modules/dev/settings-cards'

/** Settings section: shadcn Card with header and a column of rows. */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-lead text-foreground">{title}</CardTitle>
        {hint && <CardDescription className="text-caption">{hint}</CardDescription>}
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
        <ItemTitle className="w-full truncate text-body font-normal">{label}</ItemTitle>
        {hint && <ItemDescription className="text-caption">{hint}</ItemDescription>}
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
        if (!parts.length) return toast.error('Потрібен хоча б один модифікатор: Ctrl, Alt або Shift')
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
        'Натисніть комбінацію…'
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
  { value: 'light', label: 'Світла', icon: Sun },
  { value: 'dark', label: 'Темна', icon: Moon },
  { value: 'system', label: 'Як у системі', icon: Monitor }
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
        ? `Версія ${update.version} готова до встановлення`
        : update?.state === 'downloading'
          ? `Завантаження ${update.percent}%`
          : update?.state === 'error'
            ? `Помилка: ${update.message}`
            : update?.state === 'none'
              ? 'У вас остання версія'
              : update?.state === 'available'
                ? `Доступна версія ${update.version}`
                : undefined

  return (
    <Page>
      <PageHeader title="Налаштування" subtitle={info ? `Vault ${info.version}` : undefined} />
      <PageBody>
        <div className="flex max-w-4xl flex-col gap-3">
          <Section title="Ви" hint="Імʼя показується в привітанні.">
            <Row label="Як до вас звертатися">
              <Input
                key={settings.userName}
                defaultValue={settings.userName}
                placeholder="Імʼя"
                maxLength={limitsOf(settingsSchema).userName}
                onBlur={(e) => e.target.value !== settings.userName && set({ userName: e.target.value })}
                className="w-56 bg-surface"
              />
            </Row>
          </Section>

          <Section title="Оформлення">
            <RadioGroup
              value={settings.theme}
              onValueChange={(v) => set({ theme: v as Theme })}
              className="grid grid-cols-3 gap-3"
            >
              {THEMES.map((t) => {
                const active = settings.theme === t.value
                return (
                  <Label
                    key={t.value}
                    htmlFor={`theme-${t.value}`}
                    className={cn(
                      // Neutral cards with a preview; the chosen one gets a clear ring + check (no inversion).
                      'relative flex cursor-pointer flex-col items-stretch gap-2.5 rounded-2xl border bg-card p-2.5 text-body font-normal transition-[border-color,box-shadow]',
                      active ? 'border-transparent ring-2 ring-chart-1' : 'border-border hover:border-foreground/40'
                    )}
                  >
                    <ThemePreview theme={t.value} />
                    <span className="flex items-center gap-2 px-1">
                      <t.icon className="size-4 text-muted-foreground" />
                      <span className={cn(active && 'font-semibold')}>{t.label}</span>
                      {active && <Check className="ml-auto size-4 text-chart-1" />}
                    </span>
                    <RadioGroupItem value={t.value} id={`theme-${t.value}`} className="sr-only" />
                  </Label>
                )
              })}
            </RadioGroup>
          </Section>

          <Section title="Система" hint="Vault живе в треї й ловить швидкі думки з будь-якого вікна.">
            <Row label="Швидке додавання" hint="Глобальна комбінація, працює навіть коли вікно згорнуте">
              <ShortcutInput value={settings.quickAddShortcut} onChange={(quickAddShortcut) => set({ quickAddShortcut })} />
            </Row>
            <Row label="Запускати разом із Windows" hint="Працює у встановленій версії">
              <Switch checked={settings.launchAtLogin} onCheckedChange={(launchAtLogin) => set({ launchAtLogin })} />
            </Row>
            <Row label="Стартувати згорнутим у трей" hint="Під час автозапуску вікно не відкривається">
              <Switch checked={settings.startHidden} onCheckedChange={(startHidden) => set({ startHidden })} />
            </Row>
            <Row label="Закриття вікна згортає в трей" hint="Вийти повністю — через меню іконки в треї">
              <Switch checked={settings.closeToTray} onCheckedChange={(closeToTray) => set({ closeToTray })} />
            </Row>
            <Row label="Вечірнє нагадування про майданчики" hint="Пошук роботи: якщо сьогодні не відмічено майданчики. Порожньо — вимкнено">
              <Input
                type="time"
                defaultValue={settings.jobReminderTime}
                onBlur={(e) => e.target.value !== settings.jobReminderTime && set({ jobReminderTime: e.target.value })}
                className="w-28 bg-card"
              />
            </Row>
          </Section>

          <Section title="Дані" hint="База й файли лежать в одній папці. У базі зберігаються лише шляхи до картинок.">
            {info && (
              <Row label={info.dataDir} hint={`База ${fmtBytes(info.dbSizeBytes)}`}>
                <Button variant="soft" size="sm" onClick={() => api.settings.openDataDir()}>
                  <FolderOpen /> Відкрити папку
                </Button>
              </Row>
            )}
            {info && (
              <Row label="Журнал помилок" hint={info.logFile}>
                <Button variant="soft" size="sm" onClick={() => api.settings.openLogs()}>
                  <FolderOpen /> Відкрити журнал
                </Button>
              </Row>
            )}
          </Section>

          <Section
            title="Бекап"
            hint="Один файл .vaultbak: база + усі картинки й файли. Автобекап раз на день, зберігаються останні копії."
          >
            <Row
              label="Автобекап раз на день"
              hint={info?.lastBackupAt ? `Останній: ${fmtRelative(info.lastBackupAt)}` : 'Ще не робився'}
            >
              <Switch checked={settings.autoBackup} onCheckedChange={(autoBackup) => set({ autoBackup })} />
            </Row>
            <Row label="Скільки копій зберігати">
              <NumberInput
                integer
                min={1}
                max={100}
                value={settings.backupKeep}
                onChange={(v) => v !== null && set({ backupKeep: v })}
                className="w-20"
              />
            </Row>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="lime"
                disabled={!!busy}
                onClick={() => run('backup', () => createBackup.mutateAsync({ saveAs: false }), () => toast.success('Бекап створено'))}
              >
                <Archive /> Зробити бекап зараз
              </Button>
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  run('backup-as', () => createBackup.mutateAsync({ saveAs: true }), (r) => r && toast.success('Бекап збережено'))
                }
              >
                <Download /> Зберегти у файл
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => run('restore', () => api.backup.restore({}))}>
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
                          Відновити
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Section>

          <Section title="Експорт" hint="Дані ніколи не замкнені в застосунку: усе вивантажується у відкриті формати.">
            <ItemGroup className="gap-2">
              <Item size="sm" className="bg-card">
                <ItemMedia variant="icon">
                  <FileText />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-normal">Markdown</ItemTitle>
                  <ItemDescription className="text-caption">Zip: папка на розділ, файл на запис, картинки поруч</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => run('md', () => api.backup.export('markdown'), (p) => p && toast.success('Експортовано в Markdown'))}
                  >
                    Експорт
                  </Button>
                </ItemActions>
              </Item>
              <Item size="sm" className="bg-card">
                <ItemMedia variant="icon">
                  <FileJson />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-normal">JSON</ItemTitle>
                  <ItemDescription className="text-caption">Один файл з усіма таблицями</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => run('json', () => api.backup.export('json'), (p) => p && toast.success('Експортовано в JSON'))}
                  >
                    Експорт
                  </Button>
                </ItemActions>
              </Item>
            </ItemGroup>
            <p className="text-caption text-muted-foreground">
              Паролі з «Доступів» до експорту не потрапляють — вони зашифровані ключем Windows і розшифровуються лише на цьому
              компʼютері.
            </p>
          </Section>

          <GithubSettingsCard />
          <ExtensionSettingsCard />

          <Section title="Оновлення" hint="Через GitHub Releases (налаштовується в electron-builder.yml).">
            <Row label="Завантажувати оновлення автоматично" hint={updateHint}>
              <Switch checked={settings.autoUpdate} onCheckedChange={(autoUpdate) => set({ autoUpdate })} />
            </Row>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                disabled={update?.state === 'disabled' || checkUpdates.isPending}
                onClick={() => checkUpdates.mutate(undefined)}
              >
                <RefreshCw className={cn(checkUpdates.isPending && 'animate-spin')} /> Перевірити
              </Button>
              {(update?.state === 'ready' || update?.state === 'available') && (
                <Button variant="lime" onClick={() => api.updates.install()}>
                  {update.state === 'ready' ? 'Перезапустити й оновити' : 'Завантажити оновлення'}
                </Button>
              )}
            </div>
          </Section>
        </div>
      </PageBody>
    </Page>
  )
}

/** Fixed palette swatches: the preview must show the OTHER theme too, so it can't use the live CSS vars. */
type Swatch = { frame: string; card: string; line: string; accent: string }
const PREVIEW: Record<'light' | 'dark', Swatch> = {
  light: { frame: '#d8dcd2', card: '#f7f8f4', line: '#14160f1f', accent: '#d4f542' },
  dark: { frame: '#0e0f11', card: '#18191c', line: '#ffffff1f', accent: '#d8f74a' }
}

function PreviewHalf({ p }: { p: Swatch }) {
  return (
    <div className="flex h-full flex-1 gap-1 p-1.5" style={{ background: p.frame }}>
      <div className="flex w-1/4 flex-col gap-1">
        <div className="h-3 rounded-[4px]" style={{ background: p.accent }} />
        <div className="flex-1 rounded-[4px]" style={{ background: p.card }} />
      </div>
      <div className="flex flex-1 flex-col gap-1 rounded-[4px] p-1.5" style={{ background: p.card }}>
        <div className="h-1.5 w-3/5 rounded-full" style={{ background: p.line }} />
        <div className="h-1.5 w-2/5 rounded-full" style={{ background: p.line }} />
      </div>
    </div>
  )
}

function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <div aria-hidden className="flex h-16 w-full overflow-hidden rounded-xl ring-1 ring-foreground/10">
      {theme === 'light' && <PreviewHalf p={PREVIEW.light} />}
      {theme === 'dark' && <PreviewHalf p={PREVIEW.dark} />}
      {theme === 'system' && (
        <>
          <PreviewHalf p={PREVIEW.light} />
          <PreviewHalf p={PREVIEW.dark} />
        </>
      )}
    </div>
  )
}
