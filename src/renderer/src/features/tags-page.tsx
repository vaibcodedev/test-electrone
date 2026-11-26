import { useState, type ReactElement } from 'react'
import { useSearchParams } from 'react-router'
import { Plus, Tags, Trash2 } from 'lucide-react'
import { useApiMutation, useInfiniteApi, useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { EmptyState, Field, Page, PageBody, PageHeader } from '@/components/common/page'
import { VirtualList } from '@/components/common/virtual-list'
import { EntityRow } from '@/components/common/entity-link'
import { ColorSwatches } from '@/components/common/color-swatches'
import { Confirm } from '@/components/common/confirm'
import { SectionLabel } from '@/components/common/section-label'
import { DisabledHint } from '@/components/common/disabled-hint'
import { useFormGate } from '@/hooks/use-form-gate'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { plural } from '@/lib/format'
import { limitsOf } from '@/lib/limits'
import { cn } from '@/lib/utils'
import { tagInputSchema } from '@shared/domain/system'
import { PALETTE } from '@shared/colors'

const TAG_LIMITS = limitsOf(tagInputSchema)

/** Everything carrying the tag, paged (keyed by tag: another tag's rows never stand under this name). */
function TaggedRecords({ tagId }: { tagId: string }): ReactElement {
  const page = useInfiniteApi('tags', 'entities', { tagId })
  if (!page.isLoading && !page.isError && !page.items.length)
    return (
      <p className="text-caption text-muted-foreground">
        Додайте цю мітку до ідеї, сніпета чи дизайну — запис з’явиться тут.
      </p>
    )
  return (
    // Height follows the content up to 60vh, then scrolls; rows are virtualized.
    <VirtualList
      className="-mx-2.5 max-h-[60vh] flex-none"
      items={page.items}
      loading={page.isLoading}
      hasMore={page.hasMore}
      loadingMore={page.loadingMore}
      onLoadMore={page.loadMore}
      error={page.isError}
      onRetry={() => void page.refetch()}
      getKey={(e) => `${e.type}:${e.id}`}
      estimateSize={40}
      gap={0}
      renderItem={(e) => <EntityRow item={e} />}
    />
  )
}

/** Global tags shared by all modules: rename, recolor, delete, and see everything carrying a tag. */
export function TagsPage(): ReactElement {
  const [params, setParams] = useSearchParams()
  const selected = params.get('tag')
  const query = useInPlaceApi('tags', 'list')
  const { data: tags = [], isLoading } = query
  const noTags = !isLoading && tags.length === 0
  const create = useApiMutation('tags', 'create')
  const update = useApiMutation('tags', 'update')
  const remove = useApiMutation('tags', 'remove', { successMessage: 'Мітку видалено' })
  const [name, setName] = useState('')
  const current = tags.find((t) => t.id === selected)
  // An imported colour outside the palette stays visible and selected, first in the row.
  const custom =
    current?.color && !(PALETTE as readonly string[]).includes(current.color) ? current.color : null
  const swatches = custom ? [custom, ...PALETTE] : PALETTE

  const submit = async (): Promise<void> => {
    const value = name.trim()
    if (!value) return
    const tag = await create.mutateAsync({
      name: value,
      color: PALETTE[tags.length % PALETTE.length]
    })
    setName('')
    setParams({ tag: tag.id })
  }

  // The name is required: «Додати» is off while it is empty, Enter adds nothing (useFormGate).
  const { attach, reason, submit: gate } = useFormGate()
  if (query.failed)
    return <LoadError title="Не вдалося завантажити мітки" onRetry={query.retry} />
  return (
    <Page>
      <PageHeader
        title="Мітки"
        subtitle="Спільні для всіх розділів: одна мітка «shopify» знайде ідеї, сніпети, дизайни й помилки."
      />
      <PageBody>
        <div
          className={cn(
            'grid grid-cols-[minmax(280px,360px)_minmax(0,1fr)] items-start gap-3',
            !current && 'min-h-full'
          )}
        >
          <Card className="gap-3">
            <CardContent className="flex flex-col gap-3">
              <form ref={attach} onSubmit={(e) => gate(e, () => void submit())}>
                <InputGroup className="bg-card">
                  {/* data-page-new: there is no lime button in the header, so `N` puts the caret here. */}
                  <InputGroupInput
                    data-page-new
                    aria-label="Нова мітка"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Нова мітка"
                    maxLength={TAG_LIMITS.name}
                  />
                  <InputGroupAddon align="inline-end">
                    <DisabledHint reason={reason}>
                      <InputGroupButton
                        type="submit"
                        variant={name.trim() ? 'lime' : 'ghost'}
                        size="xs"
                        className="rounded-full"
                        disabled={!!reason || create.isPending}
                      >
                        <Plus /> Додати
                      </InputGroupButton>
                    </DisabledHint>
                  </InputGroupAddon>
                </InputGroup>
              </form>
              {tags.length > 0 && (
                <ItemGroup className="gap-1">
                  {tags.map((t) => {
                    const active = selected === t.id
                    return (
                      <Item
                        key={t.id}
                        asChild
                        size="xs"
                        variant={active ? 'active' : 'default'}
                        className="px-3"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setParams({ tag: t.id })}
                          aria-current={active || undefined}
                        >
                          <ItemMedia>
                            <span
                              className="size-2.5 rounded-full"
                              style={{ background: t.color ?? 'var(--muted-foreground)' }}
                            />
                          </ItemMedia>
                          <ItemContent className="min-w-0">
                            <ItemTitle className="w-full truncate font-normal" title={t.name}>
                              {t.name}
                            </ItemTitle>
                          </ItemContent>
                          <ItemActions>
                            <Badge
                              variant="soft"
                              className={cn(
                                'tabular-nums',
                                active && 'bg-ink-foreground/10 text-ink-foreground'
                              )}
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

          {/* With nothing picked the card takes the full height: its empty state sits in the middle of the page. */}
          <Card className={cn('gap-4', !current && 'self-stretch')}>
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
                  <CardTitle className="font-display text-stat-sm text-foreground">
                    {current.name}
                  </CardTitle>
                  <CardDescription>
                    {current.usage
                      ? `${current.usage} ${plural(current.usage, ['запис', 'записи', 'записів'])}`
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
                        onBlur={(e) => {
                          const value = e.target.value.trim()
                          // A tag can't be nameless: an erased name comes back instead of leaving an empty field.
                          if (!value) e.target.value = current.name
                          else if (value !== current.name)
                            update.mutate({ id: current.id, patch: { name: value } })
                        }}
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
                    <ColorSwatches
                      colors={swatches}
                      value={current.color}
                      onChange={(c) => c && update.mutate({ id: current.id, patch: { color: c } })}
                    />
                  </Field>
                  <div className="flex flex-col gap-1">
                    <SectionLabel>Позначено</SectionLabel>
                    <TaggedRecords key={current.id} tagId={current.id} />
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
