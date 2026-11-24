import { useState } from 'react'
import { Flag, Plus } from 'lucide-react'
import type { RedFlag, RedFlagPatch } from '@shared/domain/freelance'
import { useApi, useApiMutation } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  EmptyState,
  Page,
  PageBody,
  PageHeader,
  SearchInput,
  Segmented
} from '@/components/common/page'
import {
  DetailPane,
  EntityAside,
  ListItem,
  MasterDetail,
  useOpenParam
} from '@/components/common/master-detail'
import { AutoMarkdown, AutoTitle, Block, EditorStack, useEscapeToClose } from '../claude/editor-kit'
import { SEVERITY_LABEL } from './g2-labels'

const SEVERITY_VARIANT: Record<number, 'soft' | 'warn' | 'destructive'> = {
  1: 'soft',
  2: 'warn',
  3: 'destructive'
}

export function SeverityBadge({ severity }: { severity: number }) {
  return (
    <Badge variant={SEVERITY_VARIANT[severity] ?? 'soft'}>
      {SEVERITY_LABEL[severity] ?? severity}
    </Badge>
  )
}

function FlagDetail({ flag, onClose }: { flag: RedFlag; onClose: () => void }) {
  const update = useApiMutation('redflags', 'update')
  const remove = useApiMutation('redflags', 'remove', { successMessage: 'Перемещено в корзину' })
  const save = (patch: RedFlagPatch): void => update.mutate({ id: flag.id, patch })
  const entity = { type: 'redflag' as const, id: flag.id }
  useEscapeToClose(onClose)

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(flag.id)
        onClose()
      }}
      aside={
        <EntityAside
          entity={entity}
          tags={flag.tags}
          onTagsChange={(tagIds) => save({ tagIds })}
          createdAt={flag.createdAt}
          updatedAt={flag.updatedAt}
          files={false}
        >
          <Block label="Насколько серьёзно">
            <Segmented
              size="xs"
              value={String(flag.severity) as '1' | '2' | '3'}
              onChange={(v) => save({ severity: Number(v) })}
              options={[1, 2, 3].map((n) => ({
                value: String(n) as '1' | '2' | '3',
                label: SEVERITY_LABEL[n]
              }))}
            />
          </Block>
        </EntityAside>
      }
    >
      <EditorStack>
        <AutoTitle
          value={flag.title}
          onSave={(title) => save({ title })}
          placeholder="Красный флаг"
        />
        <AutoMarkdown
          label="Как распознать"
          value={flag.signs}
          onSave={(signs) => save({ signs })}
          placeholder="Признаки в описании вакансии, профиле или переписке"
          minHeight="120px"
        />
        <AutoMarkdown
          label="Что делать"
          value={flag.action}
          onSave={(action) => save({ action })}
          placeholder="Пропустить, задать вопрос, поднять цену…"
          minHeight="120px"
        />
      </EditorStack>
    </DetailPane>
  )
}

export function RedFlagsPage() {
  const [open, setOpen] = useOpenParam()
  const [search, setSearch] = useState('')
  const { data: list = [] } = useApi('redflags', 'list', { search: search || undefined })
  const create = useApiMutation('redflags', 'create', { onSuccess: (f) => setOpen(f.id) })
  const current = list.find((f) => f.id === open)

  return (
    <Page>
      <PageHeader
        title="Красные флаги"
        subtitle="Каких клиентов и вакансий лучше обходить. Клиенту можно поставить статус «Не работать» в его карточке."
        actions={
          <Button variant="lime" onClick={() => create.mutate({ title: 'Новый флаг' })}>
            <Plus /> Флаг
          </Button>
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Искать по признакам"
          className="w-72"
        />
      </PageHeader>
      <PageBody className="flex min-h-0 flex-col">
        <MasterDetail
          list={
            list.length === 0 ? (
              <EmptyState
                icon={Flag}
                title="Флагов нет"
                hint="Запишите признак проблемного клиента, как только наткнётесь на него."
              />
            ) : (
              <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
                {list.map((f) => (
                  <ListItem key={f.id} active={f.id === open} onClick={() => setOpen(f.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-body font-medium">{f.title}</div>
                        {f.signs && (
                          <div className="mt-1 line-clamp-2 text-caption opacity-70">{f.signs}</div>
                        )}
                      </div>
                      <SeverityBadge severity={f.severity} />
                    </div>
                  </ListItem>
                ))}
              </div>
            )
          }
          detail={
            current ? (
              <FlagDetail key={current.id} flag={current} onClose={() => setOpen(null)} />
            ) : null
          }
        />
      </PageBody>
    </Page>
  )
}
