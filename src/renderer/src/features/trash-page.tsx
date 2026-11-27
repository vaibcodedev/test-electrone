import { useEffect, useRef, type ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ENTITY_META } from '@shared/entity-types'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { fmtDay, fmtRelative, plural } from '@/lib/format'
import { ENTITY_ICON } from '@/app/navigation'
import { shortTitle } from '@/features/short-title'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { VirtualList } from '@/components/common/virtual-list'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import type { TrashItem } from '@shared/domain/system'
import { RecordMenu } from '@/features/record-menu/record-menu'
import { trashMenu } from '@/features/record-menu/trash-menu'

const rowKey = (item: { type: string; id: string }): string => `${item.type}:${item.id}`
const records = (n: number): string => `${n} ${plural(n, ['запис', 'записи', 'записів'])}`

/** The PageHeader h1 has tabIndex -1: focusable from code, never a Tab stop. */
function focusHeading(): void {
  document
    .querySelector<HTMLElement>('[data-slot="page-header"] h1')
    ?.focus({ focusVisible: false } as FocusOptions)
}

export function TrashPage(): ReactElement {
  const navigate = useNavigate()
  const page = useInfiniteApi('trash', 'list')
  const items = page.items
  const isLoading = page.isLoading
  const { data: total = 0 } = useApi('trash', 'count')
  const restore = useApiMutation('trash', 'restore')
  const purge = useApiMutation('trash', 'purge', { successMessage: 'Видалено назавжди' })
  const empty = useApiMutation('trash', 'empty', { successMessage: 'Кошик очищено' })

  // The focused button leaves with its row: focus moves to the next row (or the previous one, or the page
  // heading), otherwise it fell to <body> and Tab went through the title bar and the whole sidebar again.
  const refocus = useRef<{ gone: string; next: string | null } | null>(null)
  const focusAfter = (key: string): void => {
    const at = items.findIndex((i) => rowKey(i) === key)
    const next = items[at + 1] ?? items[at - 1]
    refocus.current = { gone: key, next: next ? rowKey(next) : null }
  }
  // «Очистити» leaves the header with the last record; the confirmation would hand focus back to it.
  const emptied = useRef(false)
  useEffect(() => {
    const r = refocus.current
    if (!r || items.some((i) => rowKey(i) === r.gone)) return
    refocus.current = null
    requestAnimationFrame(() => {
      const button =
        r.next && document.querySelector<HTMLElement>(`[data-trash-row="${r.next}"] [data-restore]`)
      if (button) button.focus()
      else focusHeading()
    })
  }, [items])
  useEffect(() => {
    if (total > 0 || !emptied.current) return
    emptied.current = false
    requestAnimationFrame(focusHeading)
  }, [total])

  const doRestore = (item: TrashItem): void => {
    const key = rowKey(item)
    restore.mutate(
      { type: item.type, id: item.id },
      {
        onSuccess: () => {
          focusAfter(key)
          toast.success(`Відновлено: «${shortTitle(item.title)}»`, {
            action: {
              label: 'Відкрити',
              onClick: () => navigate(ENTITY_META[item.type].route(item.id))
            }
          })
        }
      }
    )
  }
  const doPurge = (item: TrashItem): void =>
    purge.mutate({ type: item.type, id: item.id }, { onSuccess: () => focusAfter(rowKey(item)) })

  return (
    <Page>
      <PageHeader
        title="Кошик"
        subtitle={
          total
            ? `${records(total)} у кошику. Через 30 днів після видалення запис зникає назавжди — разом зі зв’язками, мітками й файлами.`
            : undefined
        }
        actions={
          total > 0 && (
            <Confirm
              title="Очистити кошик?"
              description={`${records(total)} буде видалено назавжди. Відновити не можна.`}
              confirmLabel="Очистити кошик"
              onConfirm={() => {
                emptied.current = true
                empty.mutate(undefined, {
                  onError: () => {
                    emptied.current = false
                  }
                })
              }}
            >
              <Button variant="soft">
                <Trash2 /> Очистити
              </Button>
            </Confirm>
          )
        }
      />
      <PageBody className="flex min-h-0 flex-col">
        <VirtualList
          items={items}
          loading={isLoading}
          getKey={rowKey}
          estimateSize={60}
          gap={8}
          hasMore={page.hasMore}
          loadingMore={page.loadingMore}
          onLoadMore={page.loadMore}
          error={page.isError}
          onRetry={() => void page.refetch()}
          empty={
            !isLoading && (
              <EmptyState
                illustration="trash-can"
                title="Кошик порожній"
                hint="Усе, що ви видаляєте, потрапляє сюди на 30 днів."
              />
            )
          }
          renderItem={(item) => {
            const Icon = ENTITY_ICON[item.type]
            const key = rowKey(item)
            return (
              // Right click: the same two actions (the buttons stay visible, so no «⋯»).
              <RecordMenu asChild def={trashMenu} record={item} ctx={{ restore: doRestore, purge: doPurge }}>
              <Item variant="muted" size="sm" data-trash-row={key}>
                <ItemMedia variant="icon" className="size-9 bg-card">
                  <Icon />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full truncate text-body" title={item.title}>
                    {item.title}
                  </ItemTitle>
                  <ItemDescription className="text-caption">
                    {ENTITY_META[item.type].label} · видалено {fmtRelative(item.deletedAt)} · зникне{' '}
                    {fmtDay(item.purgeAt)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-restore
                    disabled={restore.isPending}
                    onClick={() => doRestore(item)}
                  >
                    <RotateCcw /> Відновити
                  </Button>
                  <Confirm
                    title="Видалити назавжди?"
                    description={`«${shortTitle(item.title)}» буде видалено без можливості відновлення.`}
                    confirmLabel="Видалити назавжди"
                    onConfirm={() => doPurge(item)}
                  >
                    <IconAction label="Видалити назавжди" className="hover:text-destructive">
                      <Trash2 />
                    </IconAction>
                  </Confirm>
                </ItemActions>
              </Item>
              </RecordMenu>
            )
          }}
        />
      </PageBody>
    </Page>
  )
}
