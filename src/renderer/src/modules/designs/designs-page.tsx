import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Clipboard, Image, Plus, X } from 'lucide-react'
import { DESIGN_KINDS, type DesignKind } from '@shared/domain/designs'
import { useApi, useApiMutation } from '@/lib/query'
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

  const { data: designs = [], isLoading } = useApi('designs', 'list', { search: search || undefined, kind, color, tagId })
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

  const gallery = (
    <div className={cn('gap-3 [column-fill:_balance]', open ? 'columns-2' : 'columns-[240px]')}>
      {designs.map((d) => (
        <Card
          key={d.id}
          {...clickableCard(() => setOpen(d.id === open ? null : d.id))}
          aria-pressed={d.id === open}
          className={cn(
            'group relative mb-3 block w-full cursor-pointer gap-0 break-inside-avoid overflow-hidden py-0 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
            d.id === open && 'ring-2 ring-ring ring-offset-2 ring-offset-card'
          )}
        >
          <DesignMedia path={d.imagePath} alt={designTitle(d)} className="block w-full" />
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
      ))}
    </div>
  )

  return (
    <Page className="relative">
      <div {...props} className="flex min-h-0 flex-1 flex-col">
        <DropOverlay show={isOver} />
        <PageHeader
          title="Дизайны и примеры"
          subtitle="Перетащите картинки в окно или вставьте скриншот через Ctrl+V."
          actions={
            <>
              <Button variant="soft" disabled={busy} onClick={() => void importSources([{ kind: 'clipboard' }])}>
                <Clipboard /> Из буфера
              </Button>
              <PickImagesButton onSources={(s) => void importSources(s)} label="Загрузить" variant="lime" />
            </>
          }
        >
          {(boards.length > 0 || !filtered) && (
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
              {boards.map((b) => (
                <MoodboardTile key={b.id} board={b} />
              ))}
              <Button
                variant="outline"
                className="h-auto w-40 shrink-0 flex-col gap-2 rounded-3xl border-dashed font-normal text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  const b = await createBoard.mutateAsync({ title: 'Новая подборка' })
                  navigate(`/designs/boards/${b.id}`)
                }}
              >
                <span className="grid size-9 place-items-center rounded-full bg-surface">
                  <Plus />
                </span>
                Новая подборка
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} className="w-64" />
            <FilterChips
              allLabel="Все"
              options={DESIGN_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              value={kind}
              onChange={setKind}
            />
            <TagFilter value={tagId} onChange={setTagId} />
          </div>
          {palette.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12.5px] font-medium text-muted-foreground">Цвет</span>
              <ToggleGroup
                type="single"
                spacing={1}
                value={color ?? ''}
                onValueChange={(v) => setColor(v || undefined)}
                aria-label="Фильтр по цвету"
              >
                {palette.slice(0, 28).map((c) => (
                  <ToggleGroupItem
                    key={c}
                    value={c}
                    size="xs"
                    title={c}
                    aria-label={c}
                    className="size-7 min-w-7 p-0 hover:bg-transparent data-[state=on]:bg-transparent data-[state=on]:ring-2 data-[state=on]:ring-foreground data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-card"
                  >
                    <span className="size-6 rounded-full ring-1 ring-border transition-transform hover:scale-110" style={{ background: c }} />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {color && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-xs" aria-label="Сбросить цвет" onClick={() => setColor(undefined)}>
                      <X />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Сбросить цвет</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </PageHeader>
        <PageBody className="flex min-h-0 flex-col">
          {!isLoading && designs.length === 0 ? (
            <EmptyState
              icon={Image}
              title={filtered ? 'По этим фильтрам ничего нет' : 'Галерея пуста'}
              hint={
                filtered
                  ? 'Сбросьте фильтр по типу, цвету или метке.'
                  : 'Перетащите сюда скриншоты сайтов, лендингов и магазинов — или вставьте из буфера Ctrl+V.'
              }
            />
          ) : (
            <MasterDetail
              listSize="38%"
              list={<div className="min-h-0 flex-1 overflow-y-auto pr-1">{gallery}</div>}
              detail={open ? <DesignDetail id={open} onClose={() => setOpen(null)} /> : null}
            />
          )}
        </PageBody>
      </div>
    </Page>
  )
}
