import type { ComponentProps, ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { EyeOff, Settings2 } from 'lucide-react'
import { HUBS } from '@/app/navigation'
import { canHideHub, canHideItem, itemPatch, type NavPlace } from '@/app/nav-visibility'
import { useNavPrefs } from '@/hooks/use-nav-prefs'
import { useNavVisibility } from '@/hooks/use-nav-visibility'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'

/**
 * The hidden entry was the focused element; Radix would return focus to a trigger that is gone and it would
 * fall to <body>. It goes to the group's button instead, or to «Головна» when the whole group went. Runs after
 * Radix's own focus return (a 0 ms timer in FocusScope).
 */
function focusAfterHide(hubId?: string): void {
  setTimeout(() => {
    const hub = hubId ? document.querySelector<HTMLElement>(`[data-nav-hub="${hubId}"]`) : null
    ;(hub ?? document.querySelector<HTMLElement>('[data-nav-home]'))?.focus()
  }, 30)
}

/**
 * Right click (or Shift+F10 / the Menu key on a focused entry — Chromium sends `contextmenu` for both) on a
 * sidebar entry: «Сховати…» and «Налаштувати меню…». The full list of switches is in «Налаштування → Меню».
 * Extra props (from an outer `asChild` trigger such as a tooltip) go to the trigger.
 */
export function NavHideMenu({
  place,
  label,
  children,
  ...triggerProps
}: {
  place: NavPlace
  /** Name of the entry as the menu shows it: «Ідеї», «Фриланс». */
  label: string
  children: ReactElement
} & Omit<ComponentProps<typeof ContextMenuTrigger>, 'asChild' | 'children'>): ReactElement {
  const navigate = useNavigate()
  const { prefs } = useNavVisibility()
  const { hideWithUndo } = useNavPrefs()
  // The last shown item of a group takes the group with it: the menu says so up front.
  const owner =
    'item' in place ? HUBS.find((h) => h.items.some((i) => i.path === place.item)) : undefined
  const takesHub =
    !!owner && 'item' in place && itemPatch(prefs, place.item, false).hiddenNavItems === undefined
  const target: NavPlace = takesHub && owner ? { hub: owner.id } : place
  const targetLabel = takesHub && owner ? owner.title : label
  const isHub = 'hub' in target
  const canHide = 'hub' in target ? canHideHub(prefs, target.hub) : canHideItem(prefs, target.item)
  const hubId = 'hub' in place ? place.hub : owner?.id

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild {...triggerProps}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuItem
          disabled={!canHide}
          onSelect={() => {
            hideWithUndo(target, targetLabel)
            focusAfterHide(isHub ? undefined : hubId)
          }}
        >
          <EyeOff />
          <span className="truncate">
            {isHub ? `Сховати розділ «${targetLabel}»` : `Сховати «${targetLabel}»`}
          </span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => navigate('/settings#menu')}>
          <Settings2 />
          Налаштувати меню…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
