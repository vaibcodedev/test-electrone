import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ENTITY_META } from '@shared/entity-types'
import { useApi, useApiMutation, useInfiniteApi } from '@/lib/query'
import { fmtDay, fmtRelative, plural } from '@/lib/format'
import { ENTITY_ICON } from '@/app/navigation'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { IconAction } from '@/components/common/icon-action'
import { VirtualList } from '@/components/common/virtual-list'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'

const rowKey = (item: { type: string; id: string }): string => `${item.type}:${item.id}`

export function TrashPage() {
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
  useEffect(() => {
    const r = refocus.current
    if (!r || items.some((i) => rowKey(i) === r.gone)) return
    refocus.current = null
    requestAnimationFrame(() => {
      const button = r.next && document.querySelector<HTMLElement>(`[data-trash-row="${r.next}"] [data-restore]`)
      if (button) return button.focus()
      const heading = document.querySelector<HTMLElement>('[data-slot="page-header"] h1')
      if (!heading) return
      heading.tabIndex = -1
      heading.focus({ focusVisible: false } as FocusOptions)
    })
  }, [items])

  return (
    <Page>
      <PageHeader
        title="Кошик"
        subtitle={`${total ? `${total} ${plural(total, ['запис', 'записи', 'записів'])} · ` : ''}Зв’язки, мітки й файли видаляються разом із записом.`}
        actions={
          total > 0 && (
            <Confirm
              title="Очистити кошик?"
              description={`${total} ${plural(total, ['запис', 'записи', 'записів'])} буде видалено назавжди. Це не можна скасувати.`}
              confirmLabel="Очистити кошик"
              onConfirm={() => empty.mutate(undefined)}
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
          empty={!isLoading && <EmptyState icon={Trash2} title="Кошик порожній" hint="Усе, що ви видаляєте, потрапляє сюди на 30 днів." />}
          renderItem={(item) => {
            const Icon = ENTITY_ICON[item.type]
            const key = rowKey(item)
            return (
              <Item variant="muted" size="sm" data-trash-row={key}>
                <ItemMedia variant="icon" className="size-9 bg-card">
                  <Icon />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full truncate text-body">{item.title}</ItemTitle>
                  <ItemDescription className="text-caption">
                    {ENTITY_META[item.type].label} · видалено {fmtRelative(item.deletedAt)} · зникне {fmtDay(item.purgeAt)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-restore
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(
                        { type: item.type, id: item.id },
                        {
                          onSuccess: () => {
                            focusAfter(key)
                            toast.success(`Відновлено: «${item.title}»`, {
                              action: { label: 'Відкрити', onClick: () => navigate(ENTITY_META[item.type].route(item.id)) }
                            })
                          }
                        }
                      )
                    }
                  >
                    <RotateCcw /> Відновити
                  </Button>
                  <Confirm
                    title="Видалити назавжди?"
                    description={`«${item.title}» буде видалено без можливості відновлення.`}
                    confirmLabel="Видалити назавжди"
                    onConfirm={() => purge.mutate({ type: item.type, id: item.id }, { onSuccess: () => focusAfter(key) })}
                  >
                    <IconAction label="Видалити назавжди" className="hover:text-destructive">
                      <Trash2 />
                    </IconAction>
                  </Confirm>
                </ItemActions>
              </Item>
            )
          }}
        />
      </PageBody>
    </Page>
  )
}
