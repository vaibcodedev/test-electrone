import type { ReactElement } from 'react'
import { Star } from 'lucide-react'
import type { Bookmark } from '@shared/domain/bookmarks'
import { fmtRelative, hostOf, mdPreview } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ItemMedia } from '@/components/ui/item'
import { Progress } from '@/components/ui/progress'
import { ListItem } from '@/components/common/master-detail'
import { TagList } from '@/components/common/tags'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { KIND_ICON, KIND_LABEL, STATUS_BADGE, STATUS_LABEL } from './labels'

/** One bookmark in the list: kind icon, title, site, rating, reading progress and status. */
export function BookmarkRow({ bookmark: b, active, onOpen }: { bookmark: Bookmark; active: boolean; onOpen: () => void }): ReactElement {
  const Icon = KIND_ICON[b.kind]
  const note = mdPreview(b.notes)
  const reading = b.status === 'in_progress' || b.status === 'done'
  return (
    <ListItem active={active} onClick={onOpen} className="@container">
      <div className="flex items-center gap-3.5">
        <ItemMedia
          variant="icon"
          className={cn('size-10 rounded-xl', active ? 'bg-ink-foreground/10 text-ink-foreground' : 'bg-foreground/[0.07]')}
        >
          <Icon />
        </ItemMedia>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn('truncate text-body font-semibold', b.status === 'done' && !active && 'text-muted-foreground')}>
              {b.title}
            </span>
            <FavoriteMark entity={{ type: 'bookmark', id: b.id }} onInk={active} />
          </div>
          <div className={cn('mt-0.5 flex min-w-0 items-center gap-1.5 text-caption', active ? 'text-ink-muted' : 'text-muted-foreground')}>
            <span className="shrink-0">{b.url ? hostOf(b.url) : KIND_LABEL[b.kind]}</span>
            {/* Wide list only: the note's first line. */}
            {note && <span className="hidden min-w-0 truncate @2xl:inline">— {note}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {b.rating > 0 && (
            <span className={cn('hidden items-center gap-1 text-caption tabular-nums @md:flex', active ? 'text-ink-foreground' : 'text-foreground')}>
              <Star className="size-3.5 fill-current text-warn" />
              {b.rating}
            </span>
          )}
          {reading && (
            <span className="hidden items-center gap-2 @lg:flex">
              <Progress
                value={b.progress}
                aria-label="Прогрес"
                className={cn(
                  // chart-1 is contrast-checked against surfaces; on an ink row the bar uses ink colours.
                  'h-1.5 w-20',
                  active
                    ? 'bg-ink-foreground/15 *:data-[slot=progress-indicator]:bg-ink-foreground'
                    : 'bg-card *:data-[slot=progress-indicator]:bg-chart-1'
                )}
              />
              <span className={cn('w-9 text-right text-caption tabular-nums', active ? 'text-ink-muted' : 'text-muted-foreground')}>
                {b.progress}%
              </span>
            </span>
          )}
          <Badge variant={active ? 'ink' : STATUS_BADGE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
          <span className={cn('hidden w-24 text-right text-meta @3xl:inline', active ? 'text-ink-muted' : 'text-muted-foreground')}>
            {fmtRelative(b.createdAt)}
          </span>
        </div>
      </div>
      {/* Shown in the active row too (TagList has ink colours): hiding them made the row jump on click. */}
      {b.tags.length > 0 && <TagList tags={b.tags} className="mt-2 pl-13.5" />}
    </ListItem>
  )
}
