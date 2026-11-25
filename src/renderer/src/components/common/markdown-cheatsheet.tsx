import { Fragment, type ReactElement } from 'react'
import { CircleHelp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { IconAction } from './icon-action'

/** What to type → what it becomes. Short: the whole list fits the popover without scrolling. */
const SYNTAX: [string, string][] = [
  ['# Заголовок', 'заголовок, ## — менший'],
  ['**жирний**', 'жирний'],
  ['*курсив*', 'курсив'],
  ['- список', 'список, 1. — нумерований'],
  ['- [ ] задача', 'пункт із галочкою'],
  ['`код`', 'код, ``` — блок коду'],
  ['> цитата', 'цитата'],
  ['[[', 'посилання на запис'],
  ['/', 'меню блоків']
]

const KEYS: [string[], string][] = [
  [['Ctrl', 'B'], 'жирний'],
  [['Ctrl', 'I'], 'курсив'],
  [['Ctrl', 'K'], 'посилання з виділеного'],
  [['Enter'], 'наступний пункт списку'],
  [['Tab'], 'вкласти пункт, Shift+Tab — назад'],
  [['Ctrl', 'Z'], 'скасувати']
]

/**
 * «?» next to a Markdown field's mode switch: the syntax and the keys on one screen, for whoever doesn't write
 * Markdown by heart (docs/design-system.md → справка к блоку — Popover за IconAction).
 */
export function MarkdownCheatsheet(): ReactElement {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconAction label="Як писати в Markdown" className="-my-1 shrink-0">
          <CircleHelp />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-caption">
          {SYNTAX.map(([code, what]) => (
            <Fragment key={code}>
              <dt>
                <code className="font-mono text-foreground">{code}</code>
              </dt>
              <dd className="text-muted-foreground">{what}</dd>
            </Fragment>
          ))}
        </dl>
        <Separator />
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-caption">
          {KEYS.map(([keys, what]) => (
            <Fragment key={keys.join('+')}>
              <dt>
                <KbdGroup>
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </KbdGroup>
              </dt>
              <dd className="text-muted-foreground">{what}</dd>
            </Fragment>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
