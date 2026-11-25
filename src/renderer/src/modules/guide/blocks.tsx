import type { ReactElement, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { FolderOpen, ScrollText } from 'lucide-react'
import { DEFAULT_QUICK_ADD, accelToKeys, shortcutGroups } from '@/app/shortcuts'
import { api } from '@/lib/api'
import { useApi } from '@/lib/query'
import { fmtBytes } from '@/lib/format'
import { CopyButton } from '@/components/common/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/** Building blocks of the guide: paragraphs, lists, steps, screens, tips, keys, links and live widgets. */

export function Keys({ keys }: { keys: string[] }): ReactElement {
  return (
    <KbdGroup>
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </KbdGroup>
  )
}

export function P({ children }: { children: ReactNode }): ReactElement {
  return <p className="max-w-[68ch] text-lead leading-relaxed text-foreground/85">{children}</p>
}

/** A titled bullet list of practical points. */
export function Points({ items }: { items: ReactNode[] }): ReactElement {
  return (
    <ul className="flex max-w-[70ch] flex-col gap-2 text-lead leading-relaxed text-foreground/85">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-chart-1" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

export function Where({ children }: { children: ReactNode }): ReactElement {
  return <p className="text-caption text-muted-foreground">Де: {children}</p>
}

/** Numbered steps — only where the order really matters (first day, setup). */
export function Steps({ items }: { items: ReactNode[] }): ReactElement {
  return (
    <ol className="flex max-w-[70ch] flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-lead leading-relaxed text-foreground/85">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/8 text-caption font-semibold tabular-nums">
            {i + 1}
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  )
}

export function Sub({ children }: { children: ReactNode }): ReactElement {
  return <h3 className="text-body font-semibold">{children}</h3>
}

/** What each screen of a hub is for: name → one line. */
export function Screens({ items }: { items: [string, ReactNode][] }): ReactElement {
  return (
    <dl className="grid max-w-[78ch] grid-cols-[minmax(120px,max-content)_1fr] gap-x-5 gap-y-2.5 text-body leading-relaxed">
      {items.map(([name, text]) => (
        <div key={name} className="contents">
          <dt className="font-medium">{name}</dt>
          <dd className="text-foreground/80">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Tip({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex max-w-[72ch] items-start gap-2.5 rounded-2xl bg-card px-4 py-3 text-body leading-relaxed text-foreground/85">
      <Badge variant="soft" className="mt-0.5 h-5 shrink-0">
        Порада
      </Badge>
      <span>{children}</span>
    </div>
  )
}

/** A hub section: what each screen is for, «як працювати» steps and tips. */
export function Hub({
  intro,
  screens,
  steps,
  tips
}: {
  intro?: ReactNode
  screens: [string, ReactNode][]
  steps: ReactNode[]
  tips?: ReactNode[]
}): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      {intro && <P>{intro}</P>}
      <Screens items={screens} />
      <Sub>Як працювати</Sub>
      <Steps items={steps} />
      {tips?.map((t, i) => <Tip key={i}>{t}</Tip>)}
    </div>
  )
}

/** The user's own global quick-add keys (they change in settings), not a hard-coded default. */
export function QuickKeys(): ReactElement {
  const { data: settings } = useApi('settings', 'get')
  return <Keys keys={accelToKeys(settings?.quickAddShortcut ?? DEFAULT_QUICK_ADD)} />
}

/** «Налаштування → Бекап» in the text is a real link to that section (/settings#backup). */
export function SettingsLink({ section, children }: { section: string; children: ReactNode }): ReactElement {
  const navigate = useNavigate()
  return (
    <Button variant="link" onClick={() => navigate(`/settings#${section}`)}>
      {children}
    </Button>
  )
}

export function DataPaths(): ReactElement {
  const { data: info } = useApi('settings', 'info')
  const rows = info
    ? [
        { label: 'Папка даних', hint: 'усередині лежить база vault.db', path: info.dataDir },
        { label: 'Файли й картинки', hint: 'скриншоти, дизайни, вкладення, резюме', path: info.filesDir },
        { label: 'Бекапи', hint: 'файли .vaultbak, останні бекапи', path: info.backupsDir }
      ]
    : []
  return (
    <div className="flex flex-col gap-3">
      <ItemGroup className="gap-2">
        {rows.map((r) => (
          <Item key={r.label} variant="muted" size="sm">
            <ItemMedia variant="icon">
              <FolderOpen />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle>{r.label}</ItemTitle>
              <ItemDescription className="selectable truncate font-mono text-caption">{r.path}</ItemDescription>
              <ItemDescription className="text-caption">{r.hint}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <CopyButton text={r.path} />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="lime" onClick={() => void api.settings.openDataDir()}>
          <FolderOpen /> Відкрити папку даних
        </Button>
        {info && <span className="text-caption text-muted-foreground">Розмір бази: {fmtBytes(info.dbSizeBytes)}</span>}
      </div>
    </div>
  )
}

/** Shortcut table built from the same registry the app uses (app/shortcuts.ts) — it never drifts. */
export function ShortcutsTable(): ReactElement {
  const { data: settings } = useApi('settings', 'get')
  const groups = shortcutGroups(settings?.quickAddShortcut ?? DEFAULT_QUICK_ADD)
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <Sub>{g.title}</Sub>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-56">Клавіші</TableHead>
                <TableHead>Що робить</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.items.map((it) => (
                <TableRow key={it.label + it.keys.join()}>
                  <TableCell>
                    {it.sequence ? (
                      <span className="flex items-center gap-1.5">
                        <Kbd>{it.keys[0]}</Kbd>
                        <span className="text-caption text-muted-foreground">потім</span>
                        <Kbd>{it.keys[1]}</Kbd>
                      </span>
                    ) : (
                      <Keys keys={it.keys} />
                    )}
                  </TableCell>
                  <TableCell className="text-body">{it.label}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  )
}

export function LogsButton(): ReactElement {
  return (
    <Button variant="subtle" className="self-start" onClick={() => void api.settings.openLogs()}>
      <ScrollText /> Відкрити журнал помилок
    </Button>
  )
}
