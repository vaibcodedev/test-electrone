import { useEffect, type ReactElement } from 'react'
import { useLocation } from 'react-router'
import { FileJson, FileText, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { settingsSchema, type ExportFormat, type Settings } from '@shared/domain/system'
import { useApi, useApiMutation } from '@/lib/query'
import { api } from '@/lib/api'
import { fmtBytes } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { Page, PageBody, PageHeader } from '@/components/common/page'
import { PageSkeleton } from '@/components/common/page-skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { ExtensionSettingsCard, GithubSettingsCard } from '@/modules/dev/settings-cards'
import { SettingsRow, SettingsSection } from './settings/section'
import { AutosaveInput } from './settings/autosave-input'
import { ThemePicker } from './settings/theme-picker'
import { MenuSection } from './settings/menu-section'
import { ShortcutInput } from './settings/shortcut-input'
import { BackupSection } from './settings/backup-section'
import { StorageSection } from './settings/storage-section'
import { UpdatesSection } from './settings/updates-section'
import { SandboxSection } from './settings/sandbox-section'
import { isSandbox } from '@/lib/profile'
import { AiSection } from './settings/ai-section'
import { LoadError } from './route-error'

const LIMITS = limitsOf(settingsSchema)
/** Time the evening reminder starts with when it is switched on. */
const DEFAULT_REMINDER = '20:00'

const EXPORTS: {
  format: ExportFormat
  title: string
  hint: string
  icon: typeof FileText
  done: string
}[] = [
  {
    format: 'markdown',
    title: 'Markdown',
    hint: 'Zip: папка на розділ, файл на запис, картинки поруч',
    icon: FileText,
    done: 'Експортовано в Markdown'
  },
  {
    format: 'json',
    title: 'JSON',
    hint: 'Один файл з усіма таблицями',
    icon: FileJson,
    done: 'Експортовано в JSON'
  }
]

export function SettingsPage(): ReactElement {
  const { data: settings, isError, refetch } = useApi('settings', 'get')
  const { data: info } = useApi('settings', 'info')
  const save = useApiMutation('settings', 'update')
  const exportData = useApiMutation('backup', 'export')
  const { hash } = useLocation()

  const loaded = !!settings
  // /settings#backup (links from the guide): jump to that section once it is rendered.
  useEffect(() => {
    if (loaded && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash, loaded])

  if (!settings && isError)
    return <LoadError title="Не вдалося завантажити налаштування" onRetry={() => void refetch()} />
  if (!settings) return <PageSkeleton kind="form" />
  const set = (patch: Partial<Settings>): void => save.mutate(patch)

  return (
    <Page>
      <PageHeader
        title="Налаштування"
        subtitle={info ? `Vault ${info.version}${isSandbox ? ' · тестовий режим' : ''}` : undefined}
      />
      <PageBody>
        <div className="flex max-w-4xl flex-col gap-3">
          <SettingsSection id="you" title="Ви" hint="Ім’я показується в привітанні.">
            <SettingsRow label="Як до вас звертатися">
              {(id) => (
                <AutosaveInput
                  id={id}
                  value={settings.userName}
                  onSave={(userName) => userName !== settings.userName && set({ userName })}
                  placeholder="Напр.: Олена"
                  maxLength={LIMITS.userName}
                  className="w-56"
                />
              )}
            </SettingsRow>
          </SettingsSection>

          <SettingsSection id="theme" title="Оформлення">
            <ThemePicker value={settings.theme} onChange={(theme) => set({ theme })} />
          </SettingsSection>

          <MenuSection />

          <SettingsSection
            id="system"
            title="Система"
            hint="Vault живе в треї й ловить швидкі думки з будь-якого вікна."
          >
            <SettingsRow
              label="Швидке додавання"
              hint="Глобальна комбінація клавіш, працює навіть коли вікно згорнуте"
            >
              <ShortcutInput
                label="Швидке додавання"
                value={settings.quickAddShortcut}
                onChange={(quickAddShortcut) => set({ quickAddShortcut })}
              />
            </SettingsRow>
            <SettingsRow
              label="Запускати разом із Windows"
              hint={
                isSandbox
                  ? 'У тестовому режимі вимкнено: автозапуск спільний з основним Vault'
                  : 'Працює у встановленій версії'
              }
            >
              {(id) => (
                <Switch
                  id={id}
                  // One login item per OS, owned by the real Vault: the test one never changes it.
                  checked={isSandbox ? false : settings.launchAtLogin}
                  disabled={isSandbox}
                  onCheckedChange={(launchAtLogin) => set({ launchAtLogin })}
                />
              )}
            </SettingsRow>
            <SettingsRow
              label="Запускати згорнутим у трей"
              hint="Під час автозапуску вікно не відкривається"
            >
              {(id) => (
                <Switch
                  id={id}
                  checked={settings.startHidden}
                  onCheckedChange={(startHidden) => set({ startHidden })}
                />
              )}
            </SettingsRow>
            <SettingsRow
              label="Закриття вікна згортає в трей"
              hint="Вийти повністю — через меню іконки в треї"
            >
              {(id) => (
                <Switch
                  id={id}
                  checked={settings.closeToTray}
                  onCheckedChange={(closeToTray) => set({ closeToTray })}
                />
              )}
            </SettingsRow>
            <SettingsRow
              label="Вечірнє нагадування про майданчики вакансій"
              hint="Якщо сьогодні не позначено майданчики"
            >
              {(id) => (
                <Switch
                  id={id}
                  checked={!!settings.jobReminderTime}
                  onCheckedChange={(on) => set({ jobReminderTime: on ? DEFAULT_REMINDER : '' })}
                />
              )}
            </SettingsRow>
            {settings.jobReminderTime && (
              <SettingsRow label="Час нагадування">
                {(id) => (
                  <Input
                    id={id}
                    key={settings.jobReminderTime}
                    type="time"
                    defaultValue={settings.jobReminderTime}
                    onBlur={(e) =>
                      e.target.value !== settings.jobReminderTime &&
                      set({ jobReminderTime: e.target.value })
                    }
                    className="w-auto"
                  />
                )}
              </SettingsRow>
            )}
          </SettingsSection>

          <SettingsSection
            id="data"
            title="Дані"
            hint="База й файли лежать в одній папці. У базі зберігаються лише шляхи до картинок."
          >
            {info && (
              <SettingsRow
                label="Папка з даними"
                hint={`${info.dataDir} · база ${fmtBytes(info.dbSizeBytes)}`}
              >
                <Button variant="soft" size="sm" onClick={() => api.settings.openDataDir()}>
                  <FolderOpen /> Відкрити папку
                </Button>
              </SettingsRow>
            )}
            {info && (
              <SettingsRow label="Журнал помилок" hint={info.logFile}>
                <Button variant="soft" size="sm" onClick={() => api.settings.openLogs()}>
                  <FolderOpen /> Відкрити журнал
                </Button>
              </SettingsRow>
            )}
          </SettingsSection>

          <StorageSection />

          <BackupSection settings={settings} info={info} set={set} />

          <SettingsSection
            id="export"
            title="Експорт"
            hint="Дані ніколи не замкнені в застосунку: усе вивантажується у відкриті формати."
          >
            <ItemGroup className="gap-2">
              {EXPORTS.map((x) => (
                <Item key={x.format} size="sm" className="bg-card">
                  <ItemMedia variant="icon">
                    <x.icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="font-normal">{x.title}</ItemTitle>
                    <ItemDescription className="text-caption">{x.hint}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="soft"
                      size="sm"
                      aria-label={`Експортувати в ${x.title}`}
                      disabled={exportData.isPending}
                      onClick={() =>
                        exportData.mutate(x.format, {
                          onSuccess: (path) => path && toast.success(x.done)
                        })
                      }
                    >
                      Експортувати
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
            <p className="text-caption text-muted-foreground">
              Паролі з «Доступів» до експорту не потрапляють — вони зашифровані ключем Windows і
              розшифровуються лише на цьому комп’ютері.
            </p>
          </SettingsSection>

          <SandboxSection />

          <AiSection />
          <GithubSettingsCard />
          <ExtensionSettingsCard />

          <UpdatesSection settings={settings} set={set} />
        </div>
      </PageBody>
    </Page>
  )
}
