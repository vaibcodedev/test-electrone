import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Plus, Tags, Trash2 } from 'lucide-react'
import { useApi, useApiMutation } from '@/lib/query'
import { EmptyState, Field, Page, PageBody, PageHeader } from '@/components/common/page'
import { VirtualList } from '@/components/common/virtual-list'
import { EntityRow } from '@/components/common/entity-link'
import { TAG_COLORS } from '@/components/common/tags'
import { Confirm } from '@/components/common/confirm'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Global tags shared by all modules: rename, recolor, delete, and see everything carrying a tag. */
export function TagsPage() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('tag')
  const { data: tags = [] } = useApi('tags', 'list')
  const { data: entities = [] } = useApi('tags', 'entities', selected ?? '', { enabled: !!selected })
  const create = useApiMutation('tags', 'create')
  const update = useApiMutation('tags', 'update')
  const remove = useApiMutation('tags', 'remove', { successMessage: 'Метка удалена' })
  const [name, setName] = useState('')
  const current = tags.find((t) => t.id === selected)

  const submit = async (): Promise<void> => {
    const value = name.trim()
    if (!value) return
    const tag = await create.mutateAsync({ name: value, color: TAG_COLORS[tags.length % TAG_COLORS.length] })
    setName('')
    setParams({ tag: tag.id })
  }

  return (
    <Page>
      <PageHeader
        title="Метки"
        subtitle="Общие для всех разделов: одна метка «shopify» найдёт идеи, сниппеты, дизайны и ошибки."
      />
      <PageBody>
        <div className="grid grid-cols-[minmax(280px,360px)_minmax(0,1fr)] items-start gap-3">
          <Card className="gap-3">
            <CardContent className="flex flex-col gap-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void submit()
                }}
              >
                <InputGroup className="bg-card">
                  <InputGroupInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Новая метка" />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="submit"
                      variant={name.trim() ? 'lime' : 'ghost'}
                      size="xs"
                      className="rounded-full"
                      disabled={!name.trim() || create.isPending}
                    >
                      <Plus /> Добавить
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
              {tags.length === 0 ? (
                <p className="px-1 text-caption text-muted-foreground">Меток пока нет. Создайте первую выше или прямо в любой записи.</p>
              ) : (
                <ItemGroup className="gap-1">
                  {tags.map((t) => {
                    const active = selected === t.id
                    return (
                      <Item key={t.id} asChild size="xs" variant={active ? 'active' : 'default'} className="px-3">
                        <button type="button" onClick={() => setParams({ tag: t.id })} aria-current={active || undefined}>
                          <ItemMedia>
                            <span className="size-2.5 rounded-full" style={{ background: t.color ?? 'var(--muted-foreground)' }} />
                          </ItemMedia>
                          <ItemContent className="min-w-0">
                            <ItemTitle className="w-full truncate font-normal">{t.name}</ItemTitle>
                          </ItemContent>
                          <ItemActions>
                            <Badge
                              variant="soft"
                              className={cn('tabular-nums', active && 'bg-ink-foreground/10 text-ink-foreground')}
                            >
                              {t.usage}
                            </Badge>
                          </ItemActions>
                        </button>
                      </Item>
                    )
                  })}
                </ItemGroup>
              )}
            </CardContent>
          </Card>

          <Card className="gap-4">
            {!current ? (
              <EmptyState
                icon={Tags}
                title="Выберите метку"
                hint="Здесь появится всё, что ей помечено, из всех разделов."
                className="py-10"
              />
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="font-display text-stat-sm text-foreground">{current.name}</CardTitle>
                  <CardDescription>
                    {entities.length
                      ? `${entities.length} ${plural(entities.length, ['запись', 'записи', 'записей'])}`
                      : 'Пока ничем не помечено'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                    <Field label="Название">
                      <Input
                        key={current.id + current.name}
                        defaultValue={current.name}
                        className="bg-card"
                        onBlur={(e) =>
                          e.target.value.trim() &&
                          e.target.value !== current.name &&
                          update.mutate({ id: current.id, patch: { name: e.target.value.trim() } })
                        }
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </Field>
                    <Confirm
                      title={`Удалить метку «${current.name}»?`}
                      description="Записи останутся, пропадёт только метка."
                      onConfirm={() => {
                        remove.mutate(current.id)
                        setParams({})
                      }}
                    >
                      <Button variant="ghost" className="hover:text-destructive">
                        <Trash2 /> Удалить
                      </Button>
                    </Confirm>
                  </div>
                  <Field label="Цвет">
                    <ToggleGroup
                      type="single"
                      value={current.color ?? ''}
                      onValueChange={(c) => c && update.mutate({ id: current.id, patch: { color: c } })}
                      spacing={1.5}
                    >
                      {TAG_COLORS.map((c) => (
                        <ToggleGroupItem
                          key={c}
                          value={c}
                          aria-label={c}
                          size="sm"
                          className="size-8 min-w-8 p-0 data-[state=on]:bg-transparent data-[state=on]:ring-2 data-[state=on]:ring-foreground"
                        >
                          <span className="size-5 rounded-full" style={{ background: c }} />
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </Field>
                  <div className="flex flex-col gap-1">
                    <span className="text-caption font-medium text-muted-foreground">Помечено</span>
                    {entities.length ? (
                      // Height follows the content up to 60vh, then scrolls; rows are virtualized.
                      <VirtualList
                        className="-mx-2.5 max-h-[60vh] flex-none"
                        items={entities}
                        getKey={(e) => `${e.type}:${e.id}`}
                        estimateSize={40}
                        gap={0}
                        renderItem={(e) => <EntityRow item={e} />}
                      />
                    ) : (
                      <p className="text-caption text-muted-foreground">
                        Добавьте эту метку к идее, сниппету или дизайну — запись появится здесь.
                      </p>
                    )}
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </PageBody>
    </Page>
  )
}
