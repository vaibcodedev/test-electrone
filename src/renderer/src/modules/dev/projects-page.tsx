import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { FolderGit2, FolderPlus, FolderSearch } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { invalidateAll, useApi } from '@/lib/query'
import { useMainEvent } from '@/hooks/use-main-events'
import {
  EmptyState,
  FilterBar,
  FilterChips,
  NoResults,
  Page,
  PageBody,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import { CardSkeleton, Delayed } from '@/components/common/page-skeleton'
import { useOpenParam } from '@/components/common/master-detail'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ProjectCard } from './project-card'
import { ProjectSheet } from './project-sheet'
import { ScanImportDialog, type ScanResult } from './scan-import-dialog'
import { LogsPanel } from './logs-panel'
import { folderName } from './dev-shared'
import { noResultsHint, presentChips } from '@/components/common/filter-helpers'

const ONLY = ['favorite', 'running'] as const
const ONLY_LABEL: Record<(typeof ONLY)[number], string> = {
  favorite: 'Обрані',
  running: 'Запущені'
}

/** «Мои проекты»: local repos with editor buttons, script runner and live logs. */
export function DevProjectsPage(): ReactElement {
  const { data: projects = [], isLoading } = useApi('devProjects', 'list', undefined, {
    refetchInterval: 30_000
  })
  const { data: runs = [] } = useApi('devProjects', 'runs')
  const [openId, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const [only, setOnly] = useState<(typeof ONLY)[number] | undefined>()
  const [scan, setScan] = useState<ScanResult | null>(null)

  // Process started/stopped/url detected → refresh cards and run tabs.
  const onStatus = useCallback(() => invalidateAll(), [])
  useMainEvent('dev:status', onStatus)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter(
      (p) =>
        (only !== 'favorite' || p.favorite) &&
        (only !== 'running' || p.running.length > 0) &&
        (!q ||
          [p.name, p.path, p.framework ?? '', p.githubRepo].some((v) =>
            v.toLowerCase().includes(q)
          ))
    )
  }, [projects, search, only])
  const onlyChips = presentChips(
    ONLY,
    {
      favorite: projects.filter((p) => p.favorite).length,
      running: projects.filter((p) => p.running.length > 0).length
    },
    (v) => ONLY_LABEL[v],
    only
  )

  const resetFilters = (): void => {
    setSearch('')
    setOnly(undefined)
  }

  const addProject = async (): Promise<void> => {
    const path = await api.devProjects.pickFolder()
    if (!path) return
    try {
      const p = await api.devProjects.create({ name: folderName(path), path })
      invalidateAll()
      toast.success(`Додано проєкт ${p.name}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const importFolder = async (): Promise<void> => {
    const root = await api.devProjects.pickFolder()
    if (!root) return
    try {
      setScan({ root, items: await api.devProjects.scan(root) })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const list = (
    <PageBody className="h-full">
      {isLoading ? (
        // Cards of the real grid (the page header is already there): no blank body while loading.
        <Delayed delay={150}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <CardSkeleton key={i} height={200} />
            ))}
          </div>
        </Delayed>
      ) : projects.length === 0 ? (
        // «Додати проєкт» (lime, N) is in the header: the empty state offers the other way in.
        <EmptyState
          icon={FolderGit2}
          title="Додайте свої проєкти"
          hint="Вкажіть папку, де лежать усі репозиторії, — Vault знайде package.json і .git, покаже гілку й запустить dev-сервер."
          cta={{ label: 'Імпорт із папки', icon: FolderSearch, onClick: () => void importFolder() }}
        />
      ) : filtered.length === 0 ? (
        only === 'favorite' && !search.trim() ? (
          <EmptyState
            title="Обраних поки немає"
            hint="Натисніть зірочку на картці проєкту — він з’явиться тут."
          />
        ) : (
          <NoResults
            icon={FolderGit2}
            hint={noResultsHint(search, !!only)}
            onReset={resetFilters}
          />
        )
      ) : (
        <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={() => setOpen(p.id)} />
          ))}
        </div>
      )}
    </PageBody>
  )

  return (
    <Page>
      <PageHeader
        title="Мої проєкти"
        subtitle="Локальні репозиторії: відкрити в редакторі, запустити скрипт, переглянути лог."
        actions={
          <>
            {/* On an empty page the same action is the empty state's button. */}
            {projects.length > 0 && (
              // Both buttons start with a folder picker: the tooltip says this one adds every repository inside.
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="soft" onClick={() => void importFolder()}>
                    <FolderSearch /> Імпорт із папки
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Знайти всі репозиторії в папці</TooltipContent>
              </Tooltip>
            )}
            {/* Named by the result: one folder becomes one project (the toast says «Додано проєкт …»). */}
            <Button variant="lime" onClick={() => void addProject()}>
              <FolderPlus /> Додати проєкт
            </Button>
          </>
        }
      >
        {projects.length > 0 && (
          <FilterBar
            chips={
              onlyChips.length > 0 && (
                <FilterChips
                  label="Показати"
                  allLabel="Усі"
                  value={only}
                  onChange={setOnly}
                  options={onlyChips}
                />
              )
            }
            trailing={
              <SearchInput value={search} onChange={setSearch} placeholder="Знайти проєкт" />
            }
          />
        )}
      </PageHeader>

      {runs.length > 0 ? (
        <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
          <ResizablePanel defaultSize="60%" minSize="25%" className="flex min-h-0 flex-col">
            {list}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="40%" minSize="15%" className="flex min-h-0 flex-col">
            <LogsPanel runs={runs} projects={projects} />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        list
      )}

      <ProjectSheet
        project={projects.find((p) => p.id === openId) ?? null}
        onClose={() => setOpen(null)}
      />
      <ScanImportDialog scan={scan} onClose={() => setScan(null)} />
    </Page>
  )
}
