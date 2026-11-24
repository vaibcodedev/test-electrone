import { useCallback, useMemo, useState } from 'react'
import { FolderGit2, FolderPlus, FolderSearch } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { invalidateAll, useApi } from '@/lib/query'
import { useMainEvent } from '@/hooks/use-main-events'
import { EmptyState, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
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
  const [scan, setScan] = useState<ScanResult | null>(null)

  // Process started/stopped/url detected → refresh cards and run tabs.
  const onStatus = useCallback(() => invalidateAll(), [])
  useMainEvent('dev:status', onStatus)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => [p.name, p.path, p.framework ?? '', p.githubRepo].some((v) => v.toLowerCase().includes(q)))
  }, [projects, search])

  const addFolder = async (): Promise<void> => {
    const path = await api.devProjects.pickFolder()
    if (!path) return
    try {
      const p = await api.devProjects.create({ name: folderName(path), path })
      invalidateAll()
      toast.success(`Добавлен проект ${p.name}`)
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
          title="Добавьте свои проекты"
          hint="Укажите папку проекта или папку, где лежат все репозитории — Vault найдёт package.json и .git, покажет ветку и запустит dev-сервер."
          action={
            <div className="flex gap-2">
              <Button variant="lime" onClick={() => void addFolder()}>
                <FolderPlus /> Добавить папку
              </Button>
              <Button variant="soft" onClick={() => void importFolder()}>
                <FolderSearch /> Импорт из папки
              </Button>
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="Ничего не найдено" hint="Поиск идёт по названию, пути, фреймворку и репозиторию." />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
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
        title="Мои проекты"
        subtitle="Локальные репозитории: открыть в редакторе, запустить скрипт, посмотреть лог."
        actions={
          <>
            <Button variant="soft" onClick={() => void importFolder()}>
              <FolderSearch /> Импорт из папки
            </Button>
            <Button variant="lime" onClick={() => void addFolder()}>
              <FolderPlus /> Добавить папку
            </Button>
          </>
        }
      >
        {projects.length > 0 && <SearchInput value={search} onChange={setSearch} placeholder="Найти проект" className="max-w-sm" />}
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
