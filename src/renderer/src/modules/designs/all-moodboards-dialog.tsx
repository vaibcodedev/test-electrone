import { useState, type ReactElement } from 'react'
import { LayoutGrid, Search } from 'lucide-react'
import type { Moodboard } from '@shared/domain/designs'
import { useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { NoResults } from '@/components/common/page'
import { noResultsHint } from '@/components/common/filter-helpers'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { MoodboardTile } from './shared'

/**
 * Every moodboard in a searchable grid — the way to any board that didn't fit in the row over the gallery.
 * No «Нова добірка» here: the row has it, two buttons of one name on one screen confused the choice.
 */
export function AllMoodboardsDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-display text-heading">Усі добірки</DialogTitle>
          <DialogDescription>Спершу обрані, далі — нещодавно змінені.</DialogDescription>
        </DialogHeader>
        <MoodboardSearch onOpen={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * The search and the grid live as long as the dialog's content: mounted on opening, so the search starts empty
 * and the grid's query doesn't run behind a closed dialog. Nothing is reset on close — the grid used to unmount
 * and the search to clear the moment Esc was pressed, and the dialog shrank to its header while it faded out.
 */
function MoodboardSearch({ onOpen }: { onOpen: () => void }): ReactElement {
  const [search, setSearch] = useState('')
  return (
    <>
      {/* Not SearchInput: its data-page-search would make «/» jump here instead of the gallery search. */}
      <InputGroup className="h-9">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          role="searchbox"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук добірок"
          aria-label="Пошук добірок"
        />
      </InputGroup>
      <MoodboardGrid search={search} onReset={() => setSearch('')} onOpen={onOpen} />
    </>
  )
}

function MoodboardGrid({
  search,
  onReset,
  onOpen
}: {
  search: string
  onReset: () => void
  onOpen: () => void
}): ReactElement {
  const q = useDebounced(search.trim())
  const list = useInfiniteApi('moodboards', 'list', { search: q || undefined })
  return (
    <div className="flex h-[min(60vh,560px)] min-h-0 flex-col">
      <VirtualGrid<Moodboard>
        className="pr-1"
        items={list.items}
        loading={list.isLoading}
        getKey={(b) => b.id}
        minColumnWidth={176}
        rowHeight={150}
        gap={12}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        error={list.isError}
        onRetry={() => void list.refetch()}
        empty={
          list.showEmpty && (
            <NoResults icon={LayoutGrid} hint={noResultsHint(search, false)} onReset={onReset} />
          )
        }
        renderItem={(b) => <MoodboardTile board={b} layout="grid" onOpen={onOpen} />}
      />
    </div>
  )
}
