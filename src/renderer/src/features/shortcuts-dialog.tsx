import { Fragment, type ReactElement } from 'react'
import { DEFAULT_QUICK_ADD, shortcutGroups } from '@/app/shortcuts'
import { useApi } from '@/lib/query'
import { HOTKEY_DIALOG_PROPS, useUi } from '@/stores/ui-store'
import { SectionLabel } from '@/components/common/section-label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Separator } from '@/components/ui/separator'

/** Ctrl+/ or ? — every keyboard shortcut in one place (data from app/shortcuts.ts). */
export function ShortcutsDialog(): ReactElement {
  const open = useUi((s) => s.shortcutsOpen)
  const setOpen = useUi((s) => s.setShortcutsOpen)
  const { data: settings } = useApi('settings', 'get')
  const groups = shortcutGroups(settings?.quickAddShortcut ?? DEFAULT_QUICK_ADD)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Header stays put; only the groups scroll. */}
      <DialogContent
        className="flex max-h-[85vh] flex-col overflow-hidden rounded-3xl sm:max-w-[720px]"
        {...HOTKEY_DIALOG_PROPS}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-heading">Гарячі клавіші</DialogTitle>
          <DialogDescription>
            Клавіші-літери не спрацьовують, поки курсор у полі введення; комбінації з Ctrl працюють
            завжди. Глобальну комбінацію клавіш можна змінити в налаштуваннях.
          </DialogDescription>
        </DialogHeader>
        <div className="-mr-2 grid min-h-0 gap-6 overflow-y-auto pr-2 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className="flex flex-col gap-1">
              <SectionLabel>{g.title}</SectionLabel>
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
                            {i > 0 && s.sequence && (
                              <span className="font-sans text-meta text-muted-foreground">
                                потім
                              </span>
                            )}
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
