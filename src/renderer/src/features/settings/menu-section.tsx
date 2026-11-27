import { useId, useRef, useState, type ReactElement, type Ref } from 'react'
import { ChevronRight, Eye } from 'lucide-react'
import { toast } from 'sonner'
import type { NavHubId } from '@shared/domain/system'
import { HUBS, TOP_ITEMS, type NavHub } from '@/app/navigation'
import { canHideHub, isHubShown, isItemShown, type NavPrefs } from '@/app/nav-visibility'
import { useNavPrefs } from '@/hooks/use-nav-prefs'
import { useNavVisibility } from '@/hooks/use-nav-visibility'
import { IconAction } from '@/components/common/icon-action'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SettingsRow, SettingsSection } from './section'

function hubDescription(hub: NavHub, prefs: NavPrefs, shown: boolean, last: boolean): string {
  const suffix = hub.platforms ? ' · разом із платформами' : ''
  if (!shown) return `Сховано з меню${suffix}`
  if (last) return 'Хоча б один розділ лишається в меню'
  const items = hub.items.filter((i) => !prefs.hiddenItems.includes(i.path))
  const text =
    items.length === hub.items.length
      ? `Усі пункти: ${items.map((i) => i.label).join(', ')}`
      : `Показано ${items.length} з ${hub.items.length}`
  return text + suffix
}

/**
 * One group: its switch, and its items behind the chevron. The items open inside the same card, under a
 * hairline that starts at the title, with their switches in the group switch's column: one block, read as a
 * tree, instead of a loose list under the card.
 */
function HubRow({
  hub,
  prefs,
  onHub,
  onItem,
  switchRef
}: {
  hub: NavHub
  prefs: NavPrefs
  onHub: (id: NavHubId, shown: boolean) => void
  onItem: (path: string, shown: boolean) => void
  switchRef?: Ref<HTMLButtonElement>
}): ReactElement {
  const [open, setOpen] = useState(false)
  const switchId = useId()
  const descId = useId()
  const shown = isHubShown(prefs, hub.id)
  const last = shown && !canHideHub(prefs, hub.id)
  const description = hubDescription(hub, prefs, shown, last)
  const shownItems = hub.items.filter((i) => !prefs.hiddenItems.includes(i.path))
  const onlyOne = shownItems.length === 1

  return (
    <Collapsible open={open && shown} onOpenChange={setOpen} className="rounded-2xl bg-card">
      <Item size="sm">
        <ItemMedia variant="icon">
          <hub.icon />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="w-full">
            <Label
              htmlFor={switchId}
              className="cursor-pointer text-body font-normal text-foreground"
            >
              {hub.title}
            </Label>
          </ItemTitle>
          <ItemDescription id={descId} className="truncate text-caption" title={description}>
            {description}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <CollapsibleTrigger asChild>
            <IconAction
              label={`${open && shown ? 'Сховати' : 'Показати'} пункти розділу «${hub.title}»`}
              disabled={!shown}
              className="aria-expanded:[&>svg]:rotate-90 [&>svg]:transition-transform"
            >
              <ChevronRight />
            </IconAction>
          </CollapsibleTrigger>
          <Switch
            ref={switchRef}
            id={switchId}
            checked={shown}
            disabled={last}
            aria-describedby={descId}
            onCheckedChange={(v) => onHub(hub.id, v)}
          />
        </ItemActions>
      </Item>
      <CollapsibleContent>
        {/* ml-14.5 = the card's 16px padding + the 32px icon + its 10px gap: the line and the items start under
            the group's title. */}
        <ItemGroup className="mr-4 mb-2 ml-14.5 gap-0 border-t border-border/60 pt-1">
          {hub.items.map((item) => {
            const on = isItemShown(prefs, item.path)
            return (
              <Item key={item.path} size="xs" className="px-0 py-1.5">
                <item.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <ItemContent className="min-w-0">
                  <Label
                    htmlFor={`${switchId}-${item.path}`}
                    className="cursor-pointer truncate text-body font-normal text-foreground"
                  >
                    {item.label}
                  </Label>
                </ItemContent>
                <ItemActions>
                  <Switch
                    id={`${switchId}-${item.path}`}
                    aria-label={`Показувати «${item.label}» в меню`}
                    checked={on}
                    disabled={on && onlyOne}
                    onCheckedChange={(v) => onItem(item.path, v)}
                  />
                </ItemActions>
              </Item>
            )
          })}
          {onlyOne && (
            <p className="pb-1.5 text-meta text-muted-foreground">
              Щоб сховати й цей пункт, вимкніть розділ «{hub.title}».
            </p>
          )}
        </ItemGroup>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * «Налаштування → Меню» (/settings#menu): the sidebar groups and their items on/off. Hidden places leave
 * the menu, Ctrl+K sections, Alt+1…9, home tiles and the weekly review — records stay in search and links.
 */
export function MenuSection(): ReactElement {
  const { prefs, hiddenCount } = useNavVisibility()
  const { setHubShown, setItemShown, showAll } = useNavPrefs()
  const firstSwitch = useRef<HTMLButtonElement>(null)

  return (
    <SettingsSection
      id="menu"
      title="Меню"
      hint="Залиште в бічній панелі лише те, чим користуєтеся. Сховане зникає з меню, Ctrl+K і головної — записи лишаються, їх знаходить пошук і відкривають посилання."
      action={
        hiddenCount > 0 ? (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => {
              showAll()
              toast.success('Усі розділи знову в меню')
              // The button disappears: focus would fall to <body>.
              firstSwitch.current?.focus()
            }}
          >
            <Eye /> Показати все
          </Button>
        ) : undefined
      }
    >
      {TOP_ITEMS.map((item) => (
        <SettingsRow key={item.path} label={item.label} hint="Пункт під «Головною»">
          {(id) => (
            <Switch
              id={id}
              checked={isItemShown(prefs, item.path)}
              onCheckedChange={(v) => setItemShown(item.path, v)}
            />
          )}
        </SettingsRow>
      ))}
      <ItemGroup className="gap-2">
        {HUBS.map((hub, i) => (
          <HubRow
            key={hub.id}
            hub={hub}
            prefs={prefs}
            onHub={setHubShown}
            onItem={setItemShown}
            switchRef={i === 0 ? firstSwitch : undefined}
          />
        ))}
      </ItemGroup>
      <p className="text-caption text-muted-foreground">
        Головна, Гайд, Мітки, Кошик і Налаштування завжди в меню.
      </p>
    </SettingsSection>
  )
}
