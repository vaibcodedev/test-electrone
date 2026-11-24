import { RotateCcw, Trash2 } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDay, fmtRelative } from '@/lib/format'
import { ENTITY_ICON } from '@/app/navigation'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { VirtualList } from '@/components/common/virtual-list'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item'

export function TrashPage() {
  const { data: items = [], isLoading } = useApi('trash', 'list')
  const restore = useApiMutation('trash', 'restore', { successMessage: 'Восстановлено' })
  const purge = useApiMutation('trash', 'purge', { successMessage: 'Удалено навсегда' })
  const empty = useApiMutation('trash', 'empty', { successMessage: 'Корзина очищена' })

  return (
    <Page>
      <PageHeader
        title="Корзина"
        subtitle="Удалённое хранится 30 дней, потом исчезает само. Связи, метки и файлы удаляются вместе с записью."
        actions={
          items.length > 0 && (
            <Confirm
              title="Очистить корзину?"
              description={`Будет удалено навсегда: ${items.length}. Это нельзя отменить.`}
              confirmLabel="Очистить"
              onConfirm={() => empty.mutate(undefined)}
            >
              <Button variant="soft">
                <Trash2 /> Очистить
              </Button>
            </Confirm>
          )
        }
      />
      <PageBody className="flex min-h-0 flex-col">
        <VirtualList
          items={items}
          getKey={(item) => `${item.type}:${item.id}`}
          estimateSize={60}
          gap={8}
          empty={!isLoading && <EmptyState icon={Trash2} title="Корзина пуста" hint="Всё, что вы удаляете, попадает сюда на 30 дней." />}
          renderItem={(item) => {
            const Icon = ENTITY_ICON[item.type]
            return (
              <Item variant="muted" size="sm">
                <ItemMedia variant="icon" className="size-9 bg-card">
                  <Icon />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full truncate text-[13.5px]">{item.title}</ItemTitle>
                  <ItemDescription className="text-[12px]">
                    {ENTITY_META[item.type].label} · удалено {fmtRelative(item.deletedAt)} · исчезнет {fmtDay(item.purgeAt)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button variant="ghost" size="sm" onClick={() => restore.mutate({ type: item.type, id: item.id })}>
                    <RotateCcw /> Восстановить
                  </Button>
                  <Confirm
                    title="Удалить навсегда?"
                    description={`«${item.title}» будет удалено без возможности восстановления.`}
                    onConfirm={() => purge.mutate({ type: item.type, id: item.id })}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Удалить навсегда"
                      title="Удалить навсегда"
                      className="hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
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
