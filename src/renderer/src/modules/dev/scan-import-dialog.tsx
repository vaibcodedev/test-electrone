import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { plural } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { EmptyState } from '@/components/common/page'
import { FormDialog } from '@/components/common/form-dialog'

export interface ScanResult {
  root: string
  items: Awaited<ReturnType<typeof api.devProjects.scan>>
}

/** «Імпорт із папки»: folders found under a root, the checked ones become projects. */
export function ScanImportDialog({ scan, onClose }: { scan: ScanResult | null; onClose: () => void }): ReactElement {
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
    if (busy) return
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
    if (added) toast.success(`Додано ${added} ${plural(added, ['проєкт', 'проєкти', 'проєктів'])}`)
    setPicked(new Set())
    onClose()
  }

  return (
    <FormDialog
      open={!!scan}
      onOpenChange={(o) => {
        if (!o) {
          setPicked(new Set())
          onClose()
        }
      }}
      title="Імпорт проєктів"
      description={
        <span className="block truncate" title={scan?.root}>
          {scan?.root}
        </span>
      }
      submitLabel={picked.size ? `Імпортувати ${picked.size}` : 'Імпортувати'}
      onSubmit={submit}
      invalid={!picked.size}
      invalidReason={items.length ? 'Позначте проєкти, які додати' : undefined}
      pending={busy}
      className="sm:max-w-140"
    >
      {items.length === 0 ? (
        <EmptyState title="Нових проєктів не знайдено" hint="Шукаємо папки з package.json або .git — сама папка й один рівень вкладеності." className="py-8" />
      ) : (
        <>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setPicked(picked.size === items.length ? new Set() : new Set(items.map((i) => i.path)))}
            >
              {picked.size === items.length ? 'Зняти всі' : 'Вибрати всі'}
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
    </FormDialog>
  )
}
