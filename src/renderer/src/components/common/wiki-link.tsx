import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { Link2Off } from 'lucide-react'
import type { EntityRef } from '@shared/domain/common'
import { ENTITY_META } from '@shared/entity-types'
import { refKey } from '@shared/wikilinks'
import { ENTITY_ICON } from '@/app/navigation'
import type { WikiLinkTargetMap } from '@/hooks/use-wiki-link-targets'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDetailMode } from './detail-mode-context'
import { useOpenEntity } from './entity-link'

const TargetsContext = createContext<WikiLinkTargetMap>(new Map())

/** Hands the resolved targets of one Markdown text (useWikiLinkTargets) to its links. */
export function WikiLinkTargets({
  value,
  children
}: {
  value: WikiLinkTargetMap
  children: ReactNode
}): ReactElement {
  return <TargetsContext.Provider value={value}>{children}</TargetsContext.Provider>
}

/** Inline icon in running text: the text's own size, sitting on its line. */
const INLINE_ICON = 'mr-1 inline size-[0.95em] align-[-0.125em]'

/**
 * A record link inside rendered Markdown (`[Назва](vault:note/<id>)`, typed with «[[»). Live — a link with the
 * type icon and the record's current title, opens it (asks «Зберегти зміни?» first while editing). In the trash —
 * struck through, «У кошику». Gone for good — the label from the text, muted, with a broken-link icon.
 * `children` is the label as written: shown until the current title arrives and for a missing record.
 */
export function WikiLink({
  target,
  children
}: {
  target: EntityRef
  children: ReactNode
}): ReactElement {
  const resolved = useContext(TargetsContext).get(refKey(target))
  const mode = useDetailMode()
  const openEntity = useOpenEntity()
  const meta = ENTITY_META[target.type]

  if (resolved?.state === 'trashed' || resolved?.state === 'missing') {
    const trashed = resolved.state === 'trashed'
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A Tab stop: the explanation is in the tooltip, and the keyboard has to reach it too. */}
          <span
            tabIndex={0}
            data-wikilink={resolved.state}
            className={trashed ? 'text-muted-foreground line-through' : 'text-muted-foreground'}
          >
            {!trashed && <Link2Off aria-hidden className={INLINE_ICON} />}
            {(trashed && resolved.title) || children}
            <span className="sr-only">{trashed ? ' (у кошику)' : ' (запис не знайдено)'}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {trashed ? 'У кошику' : 'Запис не знайдено — його видалено назавжди'}
        </TooltipContent>
      </Tooltip>
    )
  }

  const Icon = ENTITY_ICON[target.type]
  const open = (): void => {
    const go = (): void => openEntity(target)
    if (mode.editing && mode.confirmClose) mode.confirmClose(go)
    else go()
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={`#${meta.route(target.id)}`}
          data-wikilink="live"
          onClick={(e) => {
            e.preventDefault()
            open()
          }}
        >
          <Icon aria-hidden className={INLINE_ICON} />
          {resolved?.title || children}
        </a>
      </TooltipTrigger>
      <TooltipContent>{meta.label} · відкрити</TooltipContent>
    </Tooltip>
  )
}
