import type { ReactElement, ReactNode } from 'react'
import { FolderOpen, RefreshCw } from 'lucide-react'
import type { StorageFolder, StorageUsage } from '@shared/domain/system'
import { fmtBytes, fmtNumber, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Confirm } from '@/components/common/confirm'
import { DisabledHint } from '@/components/common/disabled-hint'
import { IconAction } from '@/components/common/icon-action'
import { CardEmptyText } from '@/components/common/list-card'
import { SectionLabel } from '@/components/common/section-label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SettingsRow, SettingsSection } from './section'
import { useStorageUsage } from './use-storage-usage'

const FILE_FORMS: [string, string, string] = ['файл', 'файли', 'файлів']
const files = (n: number): string => `${n} ${plural(n, FILE_FORMS)}`

interface Part {
  key: string
  label: string
  hint: ReactNode
  /** null — not measured here (the program in dev). */
  bytes: number | null
  /** Swatch / segment fill. */
  fill: string
  folder?: { folder: StorageFolder; label: string }
}

/**
 * The parts of the total, in bar order. Colours: chart-1…4 in the order the dataviz validator passed for
 * neighbours (lime · blue · orange · green; the closest pair, orange/green, is told apart by the 2px gaps and
 * the legend), then two neutrals for what the user doesn't manage. «Інше» is the rest of the total, so the
 * parts always add up to it.
 */
function partsOf(u: StorageUsage): Part[] {
  const app = u.app?.bytes ?? 0
  const known = u.files.bytes + u.database.bytes + u.cache.bytes + u.backups.bytes + app
  return [
    {
      key: 'files',
      label: 'Файли й картинки',
      hint: u.files.count ? files(u.files.count) : 'Поки порожньо',
      bytes: u.files.bytes,
      fill: 'bg-chart-1',
      folder: { folder: 'files', label: 'Відкрити папку з файлами' }
    },
    {
      key: 'database',
      label: 'База даних',
      hint: 'Записи, мітки, пошук',
      bytes: u.database.bytes,
      fill: 'bg-chart-2',
      folder: { folder: 'data', label: 'Відкрити папку з базою' }
    },
    {
      key: 'cache',
      label: 'Кеш',
      hint: 'Тимчасові файли',
      bytes: u.cache.bytes,
      fill: 'bg-chart-3'
    },
    {
      key: 'backups',
      label: 'Бекапи',
      hint: files(u.backups.count),
      bytes: u.backups.bytes,
      fill: 'bg-chart-4',
      folder: { folder: 'backups', label: 'Відкрити папку з бекапами' }
    },
    {
      key: 'app',
      label: 'Програма',
      hint: u.app ? 'Встановлені файли Vault' : 'Видно у встановленій версії',
      bytes: u.app ? app : null,
      fill: 'bg-foreground/40',
      folder: u.app ? { folder: 'app', label: 'Відкрити папку програми' } : undefined
    },
    {
      key: 'other',
      label: 'Інше',
      hint: 'Журнали, налаштування, стан вікон',
      bytes: Math.max(0, u.total - known),
      fill: 'bg-foreground/15'
    }
  ]
}

const share = (bytes: number, total: number): string =>
  total ? `${fmtNumber(Math.round((bytes / total) * 1000) / 10)}%` : '0%'

/**
 * Thin segmented bar (dataviz «segmented bar»): one whole split into parts, 8px, fully rounded ends, a 2px
 * gap between parts, no text inside; the legend below names them and the tooltip gives the share. A part too
 * small to see still gets 4px.
 */
function UsageBar({ parts, total }: { parts: Part[]; total: number }): ReactElement {
  const shown = parts.filter((p): p is Part & { bytes: number } => !!p.bytes)
  return (
    <div
      role="img"
      aria-label={shown.map((p) => `${p.label} ${fmtBytes(p.bytes)}`).join(', ')}
      className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
    >
      {shown.map((p) => (
        <Tooltip key={p.key}>
          <TooltipTrigger asChild>
            <span className={cn('h-full min-w-1 basis-0', p.fill)} style={{ flexGrow: p.bytes }} />
          </TooltipTrigger>
          <TooltipContent>
            {p.label} — {fmtBytes(p.bytes)} · {share(p.bytes, total)}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/** One legend line: swatch, name with its folder button, what it holds, size. */
function PartRow({
  part,
  onOpen
}: {
  part: Part
  onOpen: (folder: StorageFolder) => void
}): ReactElement {
  const { folder } = part
  return (
    <li className="flex min-h-11 items-center gap-3">
      <span className={cn('size-2.5 shrink-0 rounded-full', part.fill)} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1 text-body text-foreground">
          <span className="truncate">{part.label}</span>
          {folder && (
            <IconAction
              label={folder.label}
              className="text-muted-foreground"
              onClick={() => onOpen(folder.folder)}
            >
              <FolderOpen />
            </IconAction>
          )}
        </span>
        <span className="truncate text-meta text-muted-foreground">{part.hint}</span>
      </div>
      <span className="shrink-0 text-body text-muted-foreground tabular-nums">
        {part.bytes === null ? '—' : fmtBytes(part.bytes)}
      </span>
    </li>
  )
}

/**
 * «Сховище»: the total with its parts (a bar and a legend with sizes), then «Звільнити місце» — the cleanups
 * that never touch records, files or settings. Logic lives in useStorageUsage; this is markup only. No lime
 * here: settings have no main action.
 */
export function StorageSection(): ReactElement {
  const { usage, recount, openFolder, clearCache, clearLogs, pruneBackups } = useStorageUsage()
  const u = usage.data
  const counting = usage.isFetching || recount.isPending
  const prunable = u?.backups.prunable

  return (
    <SettingsSection
      id="storage"
      title="Сховище"
      hint="Скільки місця займає Vault і що можна звільнити. Очищення не зачіпає записи, файли й налаштування."
      action={
        <IconAction
          label="Перерахувати"
          // Not `disabled` while counting: focus would drop to the page.
          aria-disabled={counting}
          onClick={() => !counting && recount.mutate(undefined)}
        >
          <RefreshCw className={cn(counting && 'motion-safe:animate-spin')} />
        </IconAction>
      }
    >
      {usage.isError && !u ? (
        <div className="flex flex-wrap items-center gap-3">
          <CardEmptyText>Не вдалося порахувати розмір.</CardEmptyText>
          <Button variant="soft" size="sm" onClick={() => void usage.refetch()}>
            Повторити
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4" aria-busy={!u || counting}>
          <div className="@container flex flex-col gap-4 rounded-2xl bg-card p-4">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <div className="flex flex-col">
                <span className="text-caption text-muted-foreground">Vault займає</span>
                {u ? (
                  <span className="font-display text-stat font-semibold text-foreground">
                    {fmtBytes(u.total)}
                  </span>
                ) : (
                  <Skeleton className="my-1.5 h-7 w-28 rounded-full" />
                )}
              </div>
              {u && u.diskFree !== null && (
                <span className="text-caption text-muted-foreground">
                  На диску вільно {fmtBytes(u.diskFree)}
                </span>
              )}
            </div>
            {u ? (
              <UsageBar parts={partsOf(u)} total={u.total} />
            ) : (
              <Skeleton className="h-2 w-full rounded-full" />
            )}
            <ul className="grid gap-x-8 gap-y-1 @lg:grid-cols-2">
              {u
                ? partsOf(u).map((p) => (
                    <PartRow
                      key={p.key}
                      part={p}
                      onOpen={(folder) => openFolder.mutate({ folder })}
                    />
                  ))
                : Array.from({ length: 6 }, (_, i) => (
                    <li key={i} className="flex min-h-11 items-center">
                      <Skeleton className="h-4 w-full rounded-full" />
                    </li>
                  ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <SectionLabel>Звільнити місце</SectionLabel>
            <SettingsRow
              label="Кеш"
              hint={`${u ? `${fmtBytes(u.cache.bytes)} · ` : ''}відновиться сам; наступний запуск може бути трохи повільнішим`}
            >
              <Button
                variant="soft"
                size="sm"
                disabled={!u || clearCache.isPending}
                onClick={clearCache.run}
              >
                Очистити кеш
              </Button>
            </SettingsRow>

            <SettingsRow
              label="Старі журнали"
              hint={
                u?.logs.removableBytes
                  ? `${fmtBytes(u.logs.removableBytes)} · поточний журнал залишиться`
                  : 'Старих немає; поточний журнал не видаляється — за ним шукають причину збою'
              }
            >
              <DisabledHint
                reason={u && !u.logs.removableBytes ? 'Старих журналів немає' : undefined}
              >
                <Confirm
                  title="Видалити старі журнали?"
                  description={
                    u
                      ? `Звільниться ${fmtBytes(u.logs.removableBytes)}. Поточний журнал залишиться. Відновити видалене не можна.`
                      : undefined
                  }
                  confirmLabel="Видалити"
                  onConfirm={() => clearLogs.mutate(undefined)}
                >
                  <Button
                    variant="soft"
                    size="sm"
                    aria-label="Видалити старі журнали"
                    disabled={!u?.logs.removableBytes || clearLogs.isPending}
                  >
                    Видалити
                  </Button>
                </Confirm>
              </DisabledHint>
            </SettingsRow>

            <SettingsRow
              label="Старі бекапи"
              hint={
                prunable?.count
                  ? `${files(prunable.count)}, ${fmtBytes(prunable.bytes)} · найновіші залишаться`
                  : 'Зайвих немає: лишаються найновіші, скільки задано в «Бекап»'
              }
            >
              {/* DisabledHint outside Confirm: the other way round a click on the inactive button opened the dialog. */}
              <DisabledHint
                reason={prunable && !prunable.count ? 'Зайвих бекапів немає' : undefined}
              >
                <Confirm
                  title="Видалити старі бекапи?"
                  description={
                    prunable
                      ? `Буде видалено ${files(prunable.count)} (${fmtBytes(prunable.bytes)}). Найновіші бекапи — скільки задано в «Бекап» — і остання страхова копія перед відновленням залишаться, копії перед оновленням теж. Відновити видалене не можна.`
                      : undefined
                  }
                  confirmLabel="Видалити"
                  onConfirm={() => pruneBackups.mutate(undefined)}
                >
                  <Button
                    variant="soft"
                    size="sm"
                    aria-label="Видалити старі бекапи"
                    disabled={!prunable?.count || pruneBackups.isPending}
                  >
                    Видалити
                  </Button>
                </Confirm>
              </DisabledHint>
            </SettingsRow>
          </div>
        </div>
      )}
    </SettingsSection>
  )
}
