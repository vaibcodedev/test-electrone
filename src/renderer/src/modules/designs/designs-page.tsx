import { useMemo, useState, type ReactElement } from 'react'
import { Clipboard, FolderOpen, Image, Palette, Trash2, X } from 'lucide-react'
import { DESIGN_KINDS, type DesignKind } from '@shared/domain/designs'
import { useApi, useInfiniteApi, useApiMutation } from '@/lib/query'
import { useDebounced } from '@/hooks/use-debounced'
import { VirtualGrid } from '@/components/common/virtual-list'
import { useFileDrop, usePastedFiles } from '@/hooks/use-file-drop'
import {
  EmptyState,
  FilterBar,
  FilterChips,
  NoResults,
  Page,
  PageBody,
  PageHeader,
  SearchInput
} from '@/components/common/page'
import { TagFilter } from '@/components/common/tags'
import { FavoriteFilter } from '@/components/common/favorite-filter'
import { FavoriteMark } from '@/components/common/favorite-mark'
import { useOpenParam } from '@/components/common/master-detail'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Card } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { clickableProps } from '@/lib/clickable'
import { revealStoredFile } from '@/lib/files'
import { IconAction } from '@/components/common/icon-action'
import { toastTrashed } from '@/components/common/trash-toast'
import { DesignDialog } from './design-dialog'
import { DesignMedia, DropOverlay, PaletteStrip, PickImagesButton } from './shared'
import { MoodboardStrip } from './moodboard-strip'
import { KIND_LABEL, designFileMeta, designTitle } from './labels'
import { useImportImages } from './use-import-images'
import { useImportPreview } from './use-import-preview'
import { isMediaFile } from './media'
import { usePaletteBackfill } from './use-palette-backfill'
import { noResultsHint } from '@/components/common/filter-helpers'
import { RecordMenu, RecordMenuButton } from '@/features/record-menu/record-menu'
import { designMenu } from './menu'

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
            {value ? (
              <span
                className="size-3.5 rounded-full ring-1 ring-foreground/30"
                style={{ background: value }}
              />
            ) : (
              <Palette />
            )}
            Колір
          </Button>
        </PopoverTrigger>
        {value && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="soft"
                size="icon-sm"
                className={chosen}
                aria-label="Скинути колір"
                onClick={() => onChange(undefined)}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Скинути колір</TooltipContent>
          </Tooltip>
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
              <span
                className="size-7 rounded-full ring-1 ring-border transition-transform hover:scale-110"
                style={{ background: c }}
              />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  )
}

export function DesignsPage(): ReactElement | null {
  const [open, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<DesignKind | undefined>()
  const [color, setColor] = useState<string | undefined>()
  const [tagId, setTagId] = useState<string | undefined>()
  const [favorite, setFavorite] = useState(false)

  const q = useDebounced(search.trim())
  const list = useInfiniteApi(
    'designs',
    'list',
    { search: q || undefined, kind, color, tagId, favorite: favorite || undefined },
    60
  )
  const { data: palette = [] } = useApi('designs', 'palette')
  // Quick delete from the tile: to the trash without a question, «Скасувати» in the toast brings it back.
  const remove = useApiMutation('designs', 'remove', {
    onSuccess: (_r, id) => toastTrashed('Дизайн переміщено в кошик', { type: 'design', id })
  })
  const { importSources, busy } = useImportImages((created) => {
    if (created.length === 1) setOpen(created[0].id)
  })
  const { isOver, props } = useFileDrop((s) => void importSources(s), { accept: isMediaFile })
  // Ctrl+V and «З буфера» show what is about to be added first; a drop is instant (the person sees it).
  const preview = useImportPreview(importSources, 'Додати в галерею')
  usePastedFiles((files) => void preview.fromFiles(files))
  usePaletteBackfill(list.items)

  const filtered = !!(search || kind || color || tagId || favorite)
  const galleryEmpty = !list.isLoading && !list.items.length && !filtered
  const resetFilters = (): void => {
    setSearch('')
    setKind(undefined)
    setColor(undefined)
    setTagId(undefined)
    setFavorite(false)
  }

  /** Uniform 4:3 thumbnails (object-cover) so rows can be virtualized; the full image is in the detail pane. */
  const gallery = (
    <VirtualGrid
      className="pr-1"
      items={list.items}
      loading={list.isLoading}
      getKey={(d) => d.id}
      // The design opens in a dialog over the gallery, so the grid keeps its full width.
      minColumnWidth={220}
      rowHeight={230}
      gap={12}
      hasMore={list.hasMore}
      loadingMore={list.loadingMore}
      onLoadMore={list.loadMore}
      renderItem={(d) => (
        <RecordMenu
          def={designMenu}
          record={d}
          ctx={{ onOpen: () => setOpen(d.id) }}
          className="group/design"
        >
          <Card
            {...clickableProps(() => setOpen(d.id))}
            // A surface frame around every image: dark screenshots on a dark page still read as separate tiles.
            className="group tile relative block w-full gap-0 overflow-hidden rounded-2xl bg-surface p-1.5 text-left"
          >
            <DesignMedia
              path={d.imagePath}
              alt={designTitle(d)}
              className="block aspect-4/3 w-full rounded-xl object-cover object-top"
            />
            {/* The palette as one strip of segments (overlapping dots read as a switch); hex values — in the pane. */}
            <PaletteStrip colors={d.colors} className="mx-1.5 mt-2" />
            <div className="min-w-0 px-1.5 pt-1.5 pb-0.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-body font-semibold" title={designTitle(d)}>
                  {designTitle(d)}
                </span>
                <FavoriteMark entity={{ type: 'design', id: d.id }} />
              </div>
              {/* «Сайт · PNG · 1440 × 900»: the kind, then the file's format and size. */}
              <div className="truncate text-meta text-muted-foreground tabular-nums">
                {[KIND_LABEL[d.kind], designFileMeta(d)].filter(Boolean).join(' · ')}
              </div>
            </div>
          </Card>
          {/* Next to the card, not in it: a button inside the role=button tile would be nested controls. Over the
            picture's corner (tile 24 − 6 frame = picture 18; 12px in clears its curve), shown on hover and focus. */}
          <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-focus-within/design:opacity-100 group-hover/design:opacity-100 has-aria-expanded:opacity-100">
            {d.imagePath && (
              <IconAction
                label="Показати в папці"
                size="icon-sm"
                className="bg-card shadow-sm hover:bg-card"
                onClick={() => void revealStoredFile(d.imagePath!)}
              >
                <FolderOpen />
              </IconAction>
            )}
            <IconAction
              label="У кошик"
              size="icon-sm"
              className="bg-card shadow-sm hover:bg-card hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate(d.id)}
            >
              <Trash2 />
            </IconAction>
            {/* The rest of the design's actions (copy the picture, moodboards, pins): the same menu as a right click. */}
            <RecordMenuButton className="size-8 bg-card text-foreground shadow-sm hover:bg-card" />
          </div>
        </RecordMenu>
      )}
    />
  )

  return (
    <Page className="relative">
      <div {...props} className="flex min-h-0 flex-1 flex-col">
        <DropOverlay show={isOver} />
        <PageHeader
          title="Галерея"
          subtitle="Перетягніть картинки у вікно або вставте скриншот через Ctrl+V."
          actions={
            <>
              <Button variant="soft" disabled={busy} onClick={() => void preview.fromClipboard()}>
                <Clipboard /> З буфера
              </Button>
              <PickImagesButton
                onSources={(s) => void importSources(s)}
                label="Завантажити"
                variant="lime"
                disabled={busy}
              />
            </>
          }
        >
          {/* Boards don't follow the gallery filters; with neither boards nor designs it hides itself. */}
          <MoodboardStrip galleryEmpty={galleryEmpty} />
          {/* An empty gallery has nothing to filter: no row of filters over «Галерея порожня». */}
          {!galleryEmpty && (
            <FilterBar
              chips={
                <FilterChips
                  label="Тип"
                  allLabel="Усі"
                  options={DESIGN_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                  value={kind}
                  onChange={setKind}
                />
              }
              trailing={
                <>
                  <FavoriteFilter type="design" value={favorite} onChange={setFavorite} />
                  <TagFilter value={tagId} onChange={setTagId} />
                  <ColorFilter palette={palette} value={color} onChange={setColor} />
                  <SearchInput value={search} onChange={setSearch} />
                </>
              }
            />
          )}
        </PageHeader>
        <PageBody className="flex min-h-0 flex-col">
          {!list.isLoading && list.items.length === 0 ? (
            filtered ? (
              <NoResults
                icon={Image}
                hint={noResultsHint(search, !!(kind || color || tagId || favorite))}
                onReset={resetFilters}
              />
            ) : (
              <EmptyState
                icon={Image}
                title="Галерея порожня"
                hint="Скриншоти сайтів, лендингів і магазинів — щоб брати з них кольори й ідеї."
                // A file picker, not a plain click: hence `action` with the picker button, soft like any cta.
                action={
                  <PickImagesButton
                    onSources={(s) => void importSources(s)}
                    label="Завантажити"
                    disabled={busy}
                  />
                }
              />
            )
          ) : (
            gallery
          )}
        </PageBody>
      </div>
      {preview.dialog}
      <DesignDialog
        id={open}
        ids={list.items.map((d) => d.id)}
        onOpen={setOpen}
        onClose={() => setOpen(null)}
      />
    </Page>
  )
}
