import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Clipboard, Image, Plus, X } from 'lucide-react'
import { DESIGN_KINDS, type DesignKind } from '@shared/domain/designs'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { isImageFile } from '@/lib/files'
import { useFileDrop, usePasteFiles } from '@/hooks/use-file-drop'
import { useHotkey } from '@/hooks/use-hotkey'
import { EmptyState, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter } from '@/components/common/tags'
import { MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { DesignDetail } from './design-detail'
import {
  DesignMedia,
  DropOverlay,
  MoodboardTile,
  PickImagesButton,
  clickableCard,
  designTitle,
  KIND_LABEL,
  useImportImages
} from './shared'

function isMedia(f: File): boolean {
  return isImageFile(f) || f.type.startsWith('video/')
}

export function DesignsPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<DesignKind | undefined>()
  const [color, setColor] = useState<string | undefined>()
  const [tagId, setTagId] = useState<string | undefined>()

  const q = useDebounced(search.trim())
  const list = useInfiniteApi('designs', 'list', { search: q || undefined, kind, color, tagId }, 60)
  const { data: palette = [] } = useApi('designs', 'palette')
  const { data: boards = [] } = useApi('moodboards', 'list')
  const createBoard = useApiMutation('moodboards', 'create')
  const { importSources, busy } = useImportImages((created) => {
    if (created.length === 1) setOpen(created[0].id)
  })
  const { isOver, props } = useFileDrop((s) => void importSources(s), { accept: isMedia })
  usePasteFiles((s) => void importSources(s))
  useHotkey('escape', () => setOpen(null), { enabled: !!open })

  const filtered = !!(search || kind || color || tagId)

  /** Uniform 4:3 thumbnails (object-cover) so rows can be virtualized; the full image is in the detail pane. */
  const gallery = (
    <VirtualGrid
      className="pr-1"
      items={list.items}
      loading={list.isLoading}
      getKey={(d) => d.id}
      minColumnWidth={open ? 180 : 240}
      rowHeight={open ? 150 : 200}
      gap={12}
      hasMore={list.hasMore}
      loadingMore={list.loadingMore}
      onLoadMore={list.loadMore}
      renderItem={(d) => (
        <Card
          {...clickableCard(() => setOpen(d.id === open ? null : d.id))}
          aria-pressed={d.id === open}
          className={cn(
            // A surface frame around every image: dark screenshots on a dark page still read as separate tiles.
            // Selection is an inset outline — an outer ring would be clipped by the scrolling grid.
            'group tile relative block w-full gap-0 overflow-hidden bg-surface p-1.5 text-left',
            d.id === open && 'bg-accent outline-2 -outline-offset-2 outline-ring'
          )}
        >
          <DesignMedia path={d.imagePath} alt={designTitle(d)} className="block aspect-[4/3] w-full rounded-[18px] object-cover object-top" />
          <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Badge variant="ink" className="max-w-full truncate">
              {designTitle(d)}
            </Badge>
            {d.colors.length > 0 && (
              <Badge variant="ink" className="shrink-0 gap-0.5 px-1.5">
                {d.colors.slice(0, 4).map((c) => (
                  <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />
                ))}
              </Badge>
            )}
          </div>
        </Card>
      )}
    />
  )

  return (
    <Page className="relative">
      <div {...props} className="flex min-h-0 flex-1 flex-col">
        <DropOverlay show={isOver} />
        <PageHeader
          title="Дизайни й приклади"
          subtitle="Перетягніть картинки у вікно або вставте скриншот через Ctrl+V."
          actions={
            <>
              <Button variant="soft" disabled={busy} onClick={() => void importSources([{ kind: 'clipboard' }])}>
                <Clipboard /> З буфера
              </Button>
              <PickImagesButton onSources={(s) => void importSources(s)} label="Завантажити" variant="lime" />
            </>
          }
        >
          {(boards.length > 0 || !filtered) && (
            <div className="-mx-1 flex gap-2.5 overflow-x-auto overflow-y-hidden px-1 pb-1">
              {boards.map((b) => (
                <MoodboardTile key={b.id} board={b} />
              ))}
              <Button
                variant="outline"
                className="h-auto w-40 shrink-0 flex-col gap-2 rounded-3xl border-dashed font-normal text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  const b = await createBoard.mutateAsync({ title: 'Нова добірка' })
                  navigate(`/designs/boards/${b.id}`)
                }}
              >
                <span className="grid size-9 place-items-center rounded-full bg-surface">
                  <Plus />
                </span>
                Нова добірка
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} className="w-64" />
            <FilterChips
              allLabel="Усі"
              options={DESIGN_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              value={kind}
              onChange={setKind}
            />
            <TagFilter value={tagId} onChange={setTagId} />
          </div>
          {palette.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-caption font-medium text-muted-foreground">Колір</span>
              <ToggleGroup
                type="single"
                spacing={1}
                value={color ?? ''}
                onValueChange={(v) => setColor(v || undefined)}
                aria-label="Фільтр за кольором"
              >
                {palette.slice(0, 28).map((c) => (
                  <ToggleGroupItem
                    key={c}
                    value={c}
                    size="xs"
                    title={c}
                    aria-label={c}
                    className="size-7 min-w-7 p-0 hover:bg-transparent on:bg-transparent on:ring-2 on:ring-foreground on:ring-offset-2 on:ring-offset-card"
                  >
                    <span className="size-6 rounded-full ring-1 ring-border transition-transform hover:scale-110" style={{ background: c }} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {color && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label="Скинути колір" onClick={() => setColor(undefined)}>
                      <X />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Скинути колір</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </PageHeader>
        <PageBody className="flex min-h-0 flex-col">
          {!list.isLoading && list.items.length === 0 ? (
            <EmptyState
              icon={Image}
              title={filtered ? 'За цими фільтрами нічого немає' : 'Галерея порожня'}
              hint={
                filtered
                  ? 'Скиньте фільтр за типом, кольором чи міткою.'
                  : 'Перетягніть сюди скриншоти сайтів, лендингів і магазинів — або вставте з буфера Ctrl+V.'
              }
            />
          ) : (
            <MasterDetail
              listSize="38%"
              list={gallery}
              detail={open ? <DesignDetail key={open} id={open} onClose={() => setOpen(null)} /> : null}
            />
          )}
        </PageBody>
      </div>
    </Page>
  )
}
