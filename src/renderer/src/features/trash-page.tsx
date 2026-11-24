import { RotateCcw, Trash2 } from 'lucide-react'
import { ENTITY_META } from '@shared/entity-types'
import { useApi, useApiMutation } from '@/lib/query'
import { fmtDay, fmtRelative } from '@/lib/format'
import { ENTITY_ICON } from '@/app/navigation'
import { EmptyState, Page, PageBody, PageHeader } from '@/components/common/page'
import { Confirm } from '@/components/common/confirm'
import { Button } from '@/components/ui/button'

export function TrashPage() {
  const { data: items = [] } = useApi('trash', 'list')
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
      <PageBody>
        {items.length === 0 ? (
          <EmptyState icon={Trash2} title="Корзина пуста" hint="Всё, что вы удаляете, попадает сюда на 30 дней." />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const Icon = ENTITY_ICON[item.type]
              return (
                <li key={`${item.type}:${item.id}`} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                  <span className="grid size-9 place-items-center rounded-full bg-card">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{item.title}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {ENTITY_META[item.type].label} · удалено {fmtRelative(item.deletedAt)} · исчезнет {fmtDay(item.purgeAt)}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => restore.mutate({ type: item.type, id: item.id })}>
                    <RotateCcw /> Восстановить
                  </Button>
                  <Confirm
                    title="Удалить навсегда?"
                    description={`«${item.title}» будет удалено без возможности восстановления.`}
                    onConfirm={() => purge.mutate({ type: item.type, id: item.id })}
                  >
                    <Button variant="ghost" size="icon-sm" title="Удалить навсегда">
                      <Trash2 />
                    </Button>
                  </Confirm>
                </li>
              )
            })}
          </ul>
        )}
      </PageBody>
    </Page>
  )
}
