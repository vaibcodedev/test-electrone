import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { EmptyState } from '@/components/common/page'

export interface ScanResult {
  root: string
  items: { name: string; path: string; hasGit: boolean; hasPackage: boolean }[]
}

/** Shows folders found under a root and adds the checked ones. */
export function ImportDialog({ scan, onClose }: { scan: ScanResult | null; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const items = scan?.items ?? []

  const toggle = (path: string, on: boolean): void =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(path)
      else next.delete(path)
      return next
    })

  const submit = async (): Promise<void> => {
    setBusy(true)
    let added = 0
    for (const it of items.filter((i) => picked.has(i.path))) {
      try {
        await api.devProjects.create({ name: it.name, path: it.path })
        added++
      } catch (e) {
        toast.error(`${it.name}: ${(e as Error).message}`)
      }
    }
    setBusy(false)
    invalidateAll()
    if (added) toast.success(`Добавлено проектов: ${added}`)
    setPicked(new Set())
    onClose()
  }

  return (
    <Dialog
      open={!!scan}
      onOpenChange={(o) => {
        if (!o) {
          setPicked(new Set())
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Импорт проектов</DialogTitle>
          <DialogDescription className="truncate" title={scan?.root}>
            {scan?.root}
          </DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <EmptyState title="Новых проектов не найдено" hint="Ищем папки с package.json или .git — сама папка и один уровень вложенности." className="py-8" />
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setPicked(picked.size === items.length ? new Set() : new Set(items.map((i) => i.path)))}
              >
                {picked.size === items.length ? 'Снять все' : 'Выбрать все'}
              </Button>
            </div>
            <ItemGroup className="max-h-[50vh] gap-1 overflow-y-auto">
              {items.map((it) => (
                <Item key={it.path} size="xs" variant="muted" asChild>
                  <label htmlFor={`imp-${it.path}`} className="cursor-pointer">
                    <Checkbox id={`imp-${it.path}`} checked={picked.has(it.path)} onCheckedChange={(v) => toggle(it.path, v === true)} />
                    <ItemContent className="min-w-0 gap-0">
                      <ItemTitle className="text-body">{it.name}</ItemTitle>
                      <ItemDescription className="truncate text-meta">{it.path}</ItemDescription>
                    </ItemContent>
                    <ItemActions className="gap-1">
                      {it.hasGit && <Badge variant="outline">git</Badge>}
                      {it.hasPackage && <Badge variant="outline">package.json</Badge>}
                    </ItemActions>
                  </label>
                </Item>
              ))}
            </ItemGroup>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="lime" disabled={!picked.size || busy} onClick={() => void submit()}>
            Добавить {picked.size || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
