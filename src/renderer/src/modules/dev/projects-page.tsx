import { useCallback, useMemo, useState } from 'react'
import { FolderGit2, FolderPlus, FolderSearch } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { invalidateAll, useApi } from '@/lib/query'
import { useMainEvent } from '@/hooks/use-main-events'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { useOpenParam } from '@/components/common/master-detail'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ProjectCard } from './project-card'
import { ProjectSheet } from './project-sheet'
import { ImportDialog, type ScanResult } from './import-dialog'
import { LogsPanel } from './logs-panel'
import { folderName } from './dev-shared'

/** «Мои проекты»: local repos with editor buttons, script runner and live logs. */
export function DevProjectsPage() {
  const { data: projects = [], isLoading } = useApi('devProjects', 'list', undefined, { refetchInterval: 30_000 })
  const { data: runs = [] } = useApi('devProjects', 'runs')
  const [openId, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const [only, setOnly] = useState<'favorite' | 'running' | undefined>()
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
        (!q || [p.name, p.path, p.framework ?? '', p.githubRepo].some((v) => v.toLowerCase().includes(q)))
    )
  }, [projects, search, only])
  const favorites = projects.filter((p) => p.favorite).length
  const runningCount = projects.filter((p) => p.running.length > 0).length

  const addFolder = async (): Promise<void> => {
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
      {isLoading ? null : projects.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="Додайте свої проєкти"
          hint="Вкажіть папку проєкту або папку, де лежать усі репозиторії — Vault знайде package.json і .git, покаже гілку й запустить dev-сервер."
          action={
            <div className="flex gap-2">
              <Button variant="lime" onClick={() => void addFolder()}>
                <FolderPlus /> Додати папку
              </Button>
              <Button variant="soft" onClick={() => void importFolder()}>
                <FolderSearch /> Імпорт із папки
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={only === 'favorite' && !search ? 'Обраних поки немає' : 'Нічого не знайдено'}
          hint={
            only === 'favorite' && !search
              ? 'Натисніть зірочку на картці проєкту — він з’явиться тут.'
              : 'Пошук іде за назвою, шляхом, фреймворком і репозиторієм.'
          }
        />
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
            <Button variant="soft" onClick={() => void importFolder()}>
              <FolderSearch /> Імпорт із папки
            </Button>
            <Button variant="lime" onClick={() => void addFolder()}>
              <FolderPlus /> Додати папку
            </Button>
          </>
        }
      >
        {projects.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <FilterChips
              allLabel="Усі"
              value={only}
              onChange={setOnly}
              options={[
                { value: 'favorite', label: 'Обрані', count: favorites },
                { value: 'running', label: 'Запущені', count: runningCount }
              ]}
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Знайти проєкт" className="ml-auto max-w-sm" />
          </div>
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

      <ProjectSheet project={projects.find((p) => p.id === openId) ?? null} onClose={() => setOpen(null)} />
      <ImportDialog scan={scan} onClose={() => setScan(null)} />
    </Page>
  )
}
