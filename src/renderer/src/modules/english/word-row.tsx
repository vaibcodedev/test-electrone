import type { ReactElement } from 'react'
import type { Word } from '@shared/domain/english'
import { fmtDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ListItem } from '@/components/common/master-detail'
import { KIND_LABEL, STAGE_COLOR, STAGE_LABEL_ONE } from './labels'

/** A word in the dictionary: term + kind on top, translation, the work sentence it came from, then stage and due. */
export function WordRow({
  word: w,
  active,
  now,
  onOpen
}: {
  word: Word
  active: boolean
  /** Page-level clock (render must stay pure). */
  now: number
  onOpen: () => void
}): ReactElement {
  const muted = active ? 'text-ink-muted' : 'text-muted-foreground'
  return (
    <ListItem active={active} onClick={onOpen}>
      <div className="flex items-baseline gap-2">
        <span className="font-display min-w-0 truncate text-heading leading-tight">{w.term}</span>
        {w.transcription && <span className={cn('truncate text-caption', muted)}>{w.transcription}</span>}
        <span className={cn('ml-auto shrink-0 text-meta', muted)}>{KIND_LABEL[w.kind]}</span>
      </div>
      {w.translation ? (
        <div className={cn('mt-0.5 truncate text-body', active ? 'text-ink-foreground/85' : 'text-foreground/85')}>{w.translation}</div>
      ) : (
        // Not a value: a missing translation must not read like one.
        <div className={cn('mt-0.5 truncate text-body italic', muted)}>Переклад не додано</div>
      )}
      {w.example && <div className={cn('mt-1.5 truncate text-caption italic', muted)}>«{w.example}»</div>}
      {/* Quiet text, no badge: a warm badge on every row competed with the lime «Повторити N». */}
      <div className={cn('mt-2.5 flex items-center gap-3 text-meta', muted)}>
        <span className="flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', STAGE_COLOR[w.stage])} />
          {STAGE_LABEL_ONE[w.stage]}
        </span>
        <span>{w.dueAt <= now ? 'повторити сьогодні' : `повтор ${fmtDay(w.dueAt)}`}</span>
      </div>
    </ListItem>
  )
}
