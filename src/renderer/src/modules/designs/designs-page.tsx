import { useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { Clipboard, Image, Palette, Plus, X } from 'lucide-react'
import { DESIGN_KINDS, type DesignKind } from '@shared/domain/designs'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { useFileDrop, usePasteFiles } from '@/hooks/use-file-drop'
import { EmptyState, FilterBar, FilterChips, Page, PageBody, PageHeader, SearchInput } from '@/components/common/page'
import { TagFilter } from '@/components/common/tags'
import { MasterDetail, useOpenParam } from '@/components/common/master-detail'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { clickableProps } from '@/lib/clickable'
import { DesignDetail } from './design-detail'
import {
  DesignMedia,
  DropOverlay,
  MoodboardTile,
  PickImagesButton,
  designTitle,
  KIND_LABEL,
  useImportImages
} from './shared'
import { isMediaFile } from './media'
import { usePaletteBackfill } from './use-palette-backfill'

/** Hex → [r, g, b]. */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Drops near-duplicates (two limes, five greys looked like a bug): keeps colours at least ~50 apart. */
function distinctColors(palette: string[], max = 16): string[] {
  const kept: string[] = []
  for (const c of palette) {
    const [r, g, b] = rgb(c)
    const close = kept.some((k) => {
      const [r2, g2, b2] = rgb(k)
      return Math.hypot(r - r2, g - g2, b - b2) < 50
    })
    if (!close) kept.push(c)
    if (kept.length >= max) break
  }
  return kept
}

/** «Колір» filter in the filter row: a button like «Мітка», swatches in a popover, the chosen one on the button. */
function ColorFilter({
  palette,
  value,
  onChange
}: {
  palette: string[]
  value: string | undefined
  onChange: (color: string | undefined) => void
}): ReactElement | null {
  const [open, setOpen] = useState(false)
  const colors = useMemo(() => distinctColors(palette), [palette])
  if (!colors.length) return null
  // Chosen = the neutral tint of a chosen tag (TagFilter): lime stays with the kind chips, the screen's filter.
  const chosen = value ? 'bg-foreground/12 font-medium hover:bg-foreground/16' : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ButtonGroup>
        <PopoverTrigger asChild>
          <Button variant="soft" size="sm" className={chosen}>
            {value ? <span className="size-3.5 rounded-full ring-1 ring-foreground/30" style={{ background: value }} /> : <Palette />}
            Колір
          </Button>
        </PopoverTrigger>
        {value && (
          <Button variant="soft" size="icon-sm" className={chosen} aria-label="Скинути колір" onClick={() => onChange(undefined)}>
            <X />
          </Button>
        )}
      </ButtonGroup>
      <PopoverContent align="start" className="w-auto rounded-2xl p-3">
        <div className="mb-2 text-caption text-muted-foreground">Дизайни, де є цей колір</div>
        <ToggleGroup
          type="single"
          spacing={1}
          value={value ?? ''}
          onValueChange={(v) => {
            onChange(v || undefined)
            setOpen(false)
          }}
          aria-label="Фільтр за кольором"
          className="grid grid-cols-8 gap-1.5"
        >
          {colors.map((c) => (
            <ToggleGroupItem
              key={c}
              value={c}
              size="xs"
              title={c}
              aria-label={c}
              className="size-8 min-w-8 p-0 hover:bg-transparent on:bg-transparent on:ring-2 on:ring-foreground on:ring-offset-2 on:ring-offset-popover"
            >
              <span className="size-7 rounded-full ring-1 ring-border transition-transform hover:scale-110" style={{ background: c }} />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  )
}

/** Says what actually hides the results: the search text, the filters or both. */
function noResultsHint(search: string, filters: boolean): string {
  const q = search.trim()
  return [q && `За запитом «${q}» нічого немає.`, filters && 'Спробуйте зняти фільтри.'].filter(Boolean).join(' ')
}

export function DesignsPage(): ReactElement | null {
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
  const { isOver, props } = useFileDrop((s) => void importSources(s), { accept: isMediaFile })
  usePasteFiles((s) => void importSources(s))
  usePaletteBackfill(list.items)

  const filtered = !!(search || kind || color || tagId)
  const galleryEmpty = !list.isLoading && !list.items.length && !filtered
  const resetFilters = (): void => {
    setSearch('')
    setKind(undefined)
    setColor(undefined)
    setTagId(undefined)
  }
  const newBoard = async (): Promise<void> => {
    if (createBoard.isPending) return
    const b = await createBoard.mutateAsync({ title: 'Нова добірка' })
    navigate(`/designs/boards/${b.id}`)
  }

  /** Uniform 4:3 thumbnails (object-cover) so rows can be virtualized; the full image is in the detail pane. */
  const gallery = (
    <VirtualGrid
      className="pr-1"
      items={list.items}
      loading={list.isLoading}
      getKey={(d) => d.id}
      minColumnWidth={open ? 180 : 220}
      rowHeight={open ? 190 : 230}
      gap={12}
      hasMore={list.hasMore}
      loadingMore={list.loadingMore}
      onLoadMore={list.loadMore}
      renderItem={(d) => (
        <Card
          {...clickableProps(() => setOpen(d.id === open ? null : d.id))}
          aria-pressed={d.id === open}
          className={cn(
            // A surface frame around every image: dark screenshots on a dark page still read as separate tiles.
            // Selection is an inset outline — an outer ring would be clipped by the scrolling grid.
            'group tile relative block w-full gap-0 overflow-hidden bg-surface p-1.5 text-left',
            d.id === open && 'bg-accent outline-2 -outline-offset-2 outline-ring'
          )}
        >
          <DesignMedia path={d.imagePath} alt={designTitle(d)} className="block aspect-[4/3] w-full rounded-[18px] object-cover object-top" />
          <div className="flex min-w-0 items-center gap-2 px-1.5 pt-2 pb-0.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-caption font-medium">{designTitle(d)}</div>
              <div className="truncate text-meta text-muted-foreground">{KIND_LABEL[d.kind]}</div>
            </div>
            {d.colors.length > 0 && (
              <span className="flex shrink-0 -space-x-1" aria-hidden>
                {d.colors.slice(0, 4).map((c) => (
                  <span key={c} className="size-3 rounded-full ring-2 ring-surface" style={{ background: c }} />
                ))}
              </span>
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
              <PickImagesButton onSources={(s) => void importSources(s)} label="Завантажити" variant="lime" disabled={busy} />
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
                className="h-auto w-32 shrink-0 flex-col gap-1.5 rounded-3xl border-dashed text-caption font-normal text-muted-foreground hover:text-foreground"
                disabled={createBoard.isPending}
                // A failure is toasted by the mutation.
                onClick={() => void newBoard().catch(() => undefined)}
              >
                <span className="grid size-7 place-items-center rounded-full bg-surface">
                  <Plus />
                </span>
                Нова добірка
              </Button>
            </div>
          )}
          {/* An empty gallery has nothing to filter: no row of filters over «Галерея порожня». */}
          {!galleryEmpty && (
            <FilterBar
              chips={
                <FilterChips
                  allLabel="Усі"
                  options={DESIGN_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                  value={kind}
                  onChange={setKind}
                />
              }
              trailing={
                <>
                  <TagFilter value={tagId} onChange={setTagId} />
                  <ColorFilter palette={palette} value={color} onChange={setColor} />
                  <SearchInput value={search} onChange={setSearch} className="w-72" />
                </>
              }
            />
          )}
        </PageHeader>
        <PageBody className="flex min-h-0 flex-col">
          {!list.isLoading && list.items.length === 0 ? (
            <EmptyState
              icon={Image}
              title={filtered ? 'Нічого не знайдено' : 'Галерея порожня'}
              hint={
                filtered
                  ? noResultsHint(search, !!(kind || color || tagId))
                  : 'Перетягніть сюди скриншоти сайтів, лендингів і магазинів — або вставте з буфера Ctrl+V.'
              }
              action={
                filtered ? (
                  <Button variant="soft" onClick={resetFilters}>
                    <X /> Скинути фільтри
                  </Button>
                ) : (
                  // A file picker, not a plain click: hence `action` with the picker button, soft like any cta.
                  <PickImagesButton onSources={(s) => void importSources(s)} label="Вибрати картинки" disabled={busy} />
                )
              }
            />
          ) : (
            // Default list width: at 38% the pane got narrower than @2xl and put the title, kind and palette
            // under the image, below the fold.
            <MasterDetail
              list={gallery}
              detail={open ? <DesignDetail key={open} id={open} onClose={() => setOpen(null)} /> : null}
            />
          )}
        </PageBody>
      </div>
    </Page>
  )
}
