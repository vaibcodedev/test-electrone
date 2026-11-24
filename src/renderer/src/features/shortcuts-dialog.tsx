import { Fragment } from 'react'
import { shortcutGroups } from '@/app/shortcuts'
import { useApi } from '@/lib/query'
import { useUi } from '@/stores/ui-store'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'

/** Ctrl+/ or ? — every keyboard shortcut in one place (data from app/shortcuts.ts). */
export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen)
  const setOpen = useUi((s) => s.setShortcutsOpen)
  const { data: settings } = useApi('settings', 'get')
  const groups = shortcutGroups(settings?.quickAddShortcut ?? 'CommandOrControl+Shift+Space')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Гарячі клавіші</DialogTitle>
          <DialogDescription>Працюють, коли курсор не в полі введення. Глобальну клавішу можна змінити в налаштуваннях.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className="flex flex-col gap-1">
              <h3 className="text-caption font-semibold text-muted-foreground">{g.title}</h3>
              <Separator className="mb-1" />
              <ItemGroup className="gap-0">
                {g.items.map((s) => (
                  <Item key={s.label} size="xs" className="px-0">
                    <ItemContent>
                      <ItemTitle className="text-body font-normal">{s.label}</ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <KbdGroup>
                        {s.keys.map((k, i) => (
                          <Fragment key={`${k}-${i}`}>
                            {i > 0 && s.sequence && <span className="text-meta text-muted-foreground">потім</span>}
                            <Kbd>{k}</Kbd>
                          </Fragment>
                        ))}
                      </KbdGroup>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
