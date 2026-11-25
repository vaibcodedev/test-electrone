import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { folderName } from './dev-shared'
import type { ScanResult } from './scan-import-dialog'

type Found = ScanResult['items'][number]

const NOTHING_FOUND =
  'Нових проєктів не знайдено: Vault шукає package.json або .git у папці й на рівень нижче, а вже додані пропускає'

/**
 * Ways to add projects: one folder («Додати проєкт»), every repository under a folder («Імпорт із папки»)
 * and folders dropped onto the page. Found repositories go to the import dialog (`scan`), except a single
 * dropped repository, which is added at once, as «Додати проєкт» would.
 */
export function useProjectImport(): {
  scan: ScanResult | null
  closeScan: () => void
  addProject: () => Promise<void>
  importFolder: () => Promise<void>
  importDropped: (paths: string[]) => Promise<void>
} {
  const [scan, setScan] = useState<ScanResult | null>(null)

  const create = async (name: string, path: string): Promise<void> => {
    try {
      const p = await api.devProjects.create({ name, path })
      invalidateAll()
      toast.success(`Додано проєкт ${p.name}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const addProject = async (): Promise<void> => {
    const path = await api.devProjects.pickFolder()
    if (path) await create(folderName(path), path)
  }

  const importFolder = async (): Promise<void> => {
    const root = await api.devProjects.pickFolder()
    if (!root) return
    try {
      const items = await api.devProjects.scan(root)
      setScan({ root, items })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const importDropped = async (paths: string[]): Promise<void> => {
    // A drag from a browser or an archive has no path on disk.
    if (!paths.length) {
      toast.error('Перетягніть папку з диска')
      return
    }
    const found = new Map<string, Found>()
    const errors: string[] = []
    for (const root of paths) {
      try {
        for (const it of await api.devProjects.scan(root)) found.set(it.path.toLowerCase(), it)
      } catch (e) {
        errors.push((e as Error).message)
      }
    }
    const items = [...found.values()]
    if (!items.length) {
      // Only files were dropped: say that a folder is expected, not that no projects were found.
      toast.error(errors.length === paths.length ? 'Перетягніть папку, а не файл' : NOTHING_FOUND)
      return
    }
    if (paths.length === 1 && items.length === 1 && items[0].path === paths[0]) {
      await create(items[0].name, items[0].path)
      return
    }
    setScan({ root: paths.join(', '), items })
  }

  return { scan, closeScan: () => setScan(null), addProject, importFolder, importDropped }
}
