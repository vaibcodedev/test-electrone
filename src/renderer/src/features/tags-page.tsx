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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { plural } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { cn } from '@/lib/utils'
import { tagInputSchema } from '@shared/domain/system'

const TAG_LIMITS = limitsOf(tagInputSchema)

/** Spoken names of the swatches (TAG_COLORS): a screen reader said «#d4f542». */
const COLOR_NAME: Record<string, string> = {
  '#d4f542': 'Лаймовий',
  '#7c8cf8': 'Фіолетово-синій',
  '#f5a524': 'Помаранчевий',
  '#f06b6b': 'Червоний',
  '#3fbf9b': 'Зелений',
  '#c98af0': 'Бузковий',
  '#5aa9f0': 'Блакитний',
  '#9a9f93': 'Сірий'
}

/** Global tags shared by all modules: rename, recolor, delete, and see everything carrying a tag. */
export function TagsPage() {
  const [params, setParams] = useSearchParams()
  const selected = params.get('tag')
  const { data: tags = [], isLoading } = useApi('tags', 'list')
  const noTags = !isLoading && tags.length === 0
  const { data: entities = [], isLoading: entitiesLoading } = useApi('tags', 'entities', selected ?? '', { enabled: !!selected })
  const create = useApiMutation('tags', 'create')
  const update = useApiMutation('tags', 'update')
  const remove = useApiMutation('tags', 'remove', { successMessage: 'Мітку видалено' })
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
        title="Мітки"
        subtitle="Спільні для всіх розділів: одна мітка «shopify» знайде ідеї, сніпети, дизайни й помилки."
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
                  <InputGroupInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Нова мітка" maxLength={TAG_LIMITS.name} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="submit"
                      variant={name.trim() ? 'lime' : 'ghost'}
                      size="xs"
                      className="rounded-full"
                      disabled={!name.trim() || create.isPending}
                    >
                      <Plus /> Додати
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
              {tags.length > 0 && (
                <ItemGroup className="gap-1">
                  {tags.map((t) => {
                    const active = selected === t.id
                    return (
                      <Item key={t.id} asChild size="xs" variant={active ? 'active' : 'default'} className="px-3">
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setParams({ tag: t.id })}
                          aria-current={active || undefined}
                        >
                          <ItemMedia>
                            <span className="size-2.5 rounded-full" style={{ background: t.color ?? 'var(--muted-foreground)' }} />
                          </ItemMedia>
                          <ItemContent className="min-w-0">
                            <ItemTitle className="w-full truncate font-normal" title={t.name}>
                              {t.name}
                            </ItemTitle>
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
            {noTags ? (
              <EmptyState
                icon={Tags}
                title="Міток ще немає"
                hint="Створіть першу ліворуч або прямо в записі — вона з’явиться в усіх розділах."
                className="py-10"
              />
            ) : !current ? (
              <EmptyState
                icon={Tags}
                title="Виберіть мітку"
                hint="Тут з’явиться все, що нею позначено, з усіх розділів."
                className="py-10"
              />
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="font-display text-stat-sm text-foreground">{current.name}</CardTitle>
                  <CardDescription>
                    {entitiesLoading
                      ? ' '
                      : entities.length
                        ? `${entities.length} ${plural(entities.length, ['запис', 'записи', 'записів'])}`
                        : 'Поки нічим не позначено'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                    <Field label="Назва">
                      <Input
                        key={current.id + current.name}
                        defaultValue={current.name}
                        maxLength={TAG_LIMITS.name}
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
                      title={`Видалити мітку «${current.name}»?`}
                      description="Записи залишаться, зникне лише мітка."
                      onConfirm={() => {
                        remove.mutate(current.id)
                        setParams({})
                      }}
                    >
                      <Button variant="ghost" className="hover:text-destructive">
                        <Trash2 /> Видалити
                      </Button>
                    </Confirm>
                  </div>
                  <Field label="Колір">
                    <ToggleGroup
                      type="single"
                      value={current.color ?? ''}
                      onValueChange={(c) => c && update.mutate({ id: current.id, patch: { color: c } })}
                      spacing={1.5}
                    >
                      {TAG_COLORS.map((c) => (
                        <Tooltip key={c}>
                          <TooltipTrigger asChild>
                            <ToggleGroupItem
                              value={c}
                              aria-label={COLOR_NAME[c] ?? c}
                              size="sm"
                              className="size-8 min-w-8 p-0 aria-checked:bg-transparent aria-checked:ring-2 aria-checked:ring-foreground"
                            >
                              <span className="size-5 rounded-full" style={{ background: c }} />
                            </ToggleGroupItem>
                          </TooltipTrigger>
                          <TooltipContent>{COLOR_NAME[c] ?? c}</TooltipContent>
                        </Tooltip>
                      ))}
                    </ToggleGroup>
                  </Field>
                  <div className="flex flex-col gap-1">
                    <span className="text-caption font-medium text-muted-foreground">Позначено</span>
                    {entitiesLoading || entities.length ? (
                      // Height follows the content up to 60vh, then scrolls; rows are virtualized.
                      <VirtualList
                        className="-mx-2.5 max-h-[60vh] flex-none"
                        items={entities}
                        loading={entitiesLoading}
                        getKey={(e) => `${e.type}:${e.id}`}
                        estimateSize={40}
                        gap={0}
                        renderItem={(e) => <EntityRow item={e} />}
                      />
                    ) : (
                      <p className="text-caption text-muted-foreground">
                        Додайте цю мітку до ідеї, сніпета чи дизайну — запис з’явиться тут.
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
