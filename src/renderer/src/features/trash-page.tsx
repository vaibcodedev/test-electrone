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
  const restore = useApiMutation('trash', 'restore', { successMessage: 'Відновлено' })
  const purge = useApiMutation('trash', 'purge', { successMessage: 'Видалено назавжди' })
  const empty = useApiMutation('trash', 'empty', { successMessage: 'Кошик очищено' })

  return (
    <Page>
      <PageHeader
        title="Кошик"
        subtitle="Видалене зберігається 30 днів, потім зникає саме. Зв’язки, мітки й файли видаляються разом із записом."
        actions={
          items.length > 0 && (
            <Confirm
              title="Очистити кошик?"
              description={`Буде видалено назавжди: ${items.length}. Це не можна скасувати.`}
              confirmLabel="Очистити"
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
          getKey={(item) => `${item.type}:${item.id}`}
          estimateSize={60}
          gap={8}
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
                  <Button variant="ghost" size="sm" onClick={() => restore.mutate({ type: item.type, id: item.id })}>
                    <RotateCcw /> Відновити
                  </Button>
                  <Confirm
                    title="Видалити назавжди?"
                    description={`«${item.title}» буде видалено без можливості відновлення.`}
                    onConfirm={() => purge.mutate({ type: item.type, id: item.id })}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Видалити назавжди"
                      title="Видалити назавжди"
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
