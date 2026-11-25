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

export function TrashPage() {
  const navigate = useNavigate()
  const page = useInfiniteApi('trash', 'list')
  const items = page.items
  const isLoading = page.isLoading
  const { data: total = 0 } = useApi('trash', 'count')
  const restore = useApiMutation('trash', 'restore')
  const purge = useApiMutation('trash', 'purge', { successMessage: 'Видалено назавжди' })
  const empty = useApiMutation('trash', 'empty', { successMessage: 'Кошик очищено' })

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
          getKey={(item) => `${item.type}:${item.id}`}
          estimateSize={60}
          gap={8}
          hasMore={page.hasMore}
          loadingMore={page.loadingMore}
          onLoadMore={page.loadMore}
          empty={!isLoading && <EmptyState icon={Trash2} title="Кошик порожній" hint="Усе, що ви видаляєте, потрапляє сюди на 30 днів." />}
          renderItem={(item) => {
            const Icon = ENTITY_ICON[item.type]
            return (
              <Item variant="muted" size="sm">
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
                    disabled={restore.isPending}
                    onClick={() =>
                      restore.mutate(
                        { type: item.type, id: item.id },
                        {
                          onSuccess: () =>
                            toast.success(`Відновлено: «${item.title}»`, {
                              action: { label: 'Відкрити', onClick: () => navigate(ENTITY_META[item.type].route(item.id)) }
                            })
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
                    onConfirm={() => purge.mutate({ type: item.type, id: item.id })}
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
