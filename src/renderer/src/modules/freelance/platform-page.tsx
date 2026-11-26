import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Archive, ArchiveRestore, Handshake, SearchX } from 'lucide-react'
import type { Platform } from '@shared/domain/freelance'
import { useApiMutation, useInfiniteApi, useInPlaceApi } from '@/lib/query'
import { LoadError } from '@/features/route-error'
import { Button } from '@/components/ui/button'
import { fmtMoney, fmtPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { EmptyState, Page, PageHeader } from '@/components/common/page'
import { useOpenParam } from '@/components/common/master-detail'
import { BILLING_LABEL, PROJECT_STATUS_BADGE, PROJECT_STATUS_LABEL } from '../crm/labels'
import { NewProposalButton, ProposalsTab } from './proposal-tab'
import { useNewParam } from '@/hooks/use-new-param'
import { CreditsTab } from './credits-tab'
import { StatsTab } from './stats-tab'
import { PlatformSettingsTab } from './platform-settings-tab'

type Tab = 'proposals' | 'contracts' | 'credits' | 'stats' | 'settings'

function ContractsTab({ platform }: { platform: Platform }) {
  const navigate = useNavigate()
  // Paged table: 100 contracts at a time, «Показати ще» below.
  const page = useInfiniteApi('projects', 'list', { platformId: platform.id })
  const projects = page.items
  const isLoading = page.isLoading
  if (!isLoading && projects.length === 0) {
    return (
      <EmptyState
        icon={Handshake}
        title="Контрактів поки немає"
        hint="Відкрийте виграний відгук і натисніть «Контракт» — клієнт і проєкт з’являться тут і в «Клієнтах й контрактах»."
      />
    )
  }
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Контракт</TableHead>
            <TableHead>Клієнт</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Оплата</TableHead>
            <TableHead className="text-right">Зароблено</TableHead>
            <TableHead className="text-right">На руки</TableHead>
            <TableHead className="pr-4 text-right">Комісія</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
            <TableRow
              key={p.id}
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => navigate(`/projects/${p.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/projects/${p.id}`)}
            >
              <TableCell className="max-w-75 truncate pl-4 font-medium">{p.title}</TableCell>
              <TableCell className="text-muted-foreground">{p.clientName ?? '—'}</TableCell>
              <TableCell>
                <Badge variant={PROJECT_STATUS_BADGE[p.status]}>
                  {PROJECT_STATUS_LABEL[p.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{BILLING_LABEL[p.billing]}</TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtMoney(p.earnedAmount, p.currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtMoney(p.netPaidAmount, p.currency)}
              </TableCell>
              <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">
                {p.effectiveFeePercent}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {page.hasMore && (
        <div className="flex justify-center border-t border-border p-2">
          <Button variant="subtle" size="sm" disabled={page.loadingMore} onClick={page.loadMore}>
            {page.loadingMore ? 'Завантажую…' : 'Показати ще'}
          </Button>
        </div>
      )}
    </div>
  )
}

/** `/freelance/p/:platformId` — one platform with its proposals, contracts, credits, stats and settings. */
export function PlatformPage() {
  const { platformId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const record = useInPlaceApi('platforms', 'get', platformId, { enabled: !!platformId })
  const { data: platform, isLoading } = record
  const update = useApiMutation('platforms', 'update', { successMessage: 'Платформа знову в меню' })
  const [, setOpenId] = useOpenParam()
  // «+ Відгук» sits in the page header (where `N` looks for it); the overview lands here with ?new=1.
  const [newOpen, setNewOpen] = useState(false)
  useNewParam(() => setNewOpen(true))

  if (record.failed)
    return <LoadError title="Не вдалося завантажити платформу" onRetry={record.retry} />
  if (isLoading) {
    return (
      <Page className="gap-4 p-8">
        <Skeleton className="h-12 w-72 rounded-2xl" />
        <Skeleton className="h-96 rounded-3xl" />
      </Page>
    )
  }
  if (!platform)
    return (
      <EmptyState
        icon={SearchX}
        title="Платформу не знайдено"
        hint="Можливо, вона в архіві або її видалено."
      />
    )

  const tabs: { value: Tab; label: string }[] = [
    { value: 'proposals', label: 'Відгуки' },
    { value: 'contracts', label: 'Контракти' },
    ...(platform.creditsName ? [{ value: 'credits' as Tab, label: platform.creditsName }] : []),
    { value: 'stats', label: 'Статистика' },
    { value: 'settings', label: 'Налаштування' }
  ]
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && tabs.some((t) => t.value === requested) ? requested : 'proposals'

  return (
    <Page>
      <Tabs
        value={tab}
        onValueChange={(v) =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set('tab', v)
              next.delete('open')
              return next
            },
            { replace: true }
          )
        }
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <span
                className="size-3.5 shrink-0 rounded-full"
                style={{ background: platform.color ?? 'var(--muted-foreground)' }}
              />
              {platform.name}
            </span>
          }
          subtitle={
            platform.archived
              ? 'В архіві'
              : `Типова комісія ${fmtPercent(platform.defaultFeePercent)}${platform.creditsName ? ` · ${platform.creditsName} — ${fmtMoney(platform.creditPrice, platform.currency)} за одиницю` : ''}`
          }
          actions={
            tab === 'proposals' && (
              <NewProposalButton
                platform={platform}
                open={newOpen}
                onOpenChange={setNewOpen}
                onCreated={(p) => setOpenId(p.id)}
              />
            )
          }
        >
          <TabsList className="w-fit">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </PageHeader>
        {platform.archived && (
          <div className="mx-8 mb-3 flex items-center gap-3 rounded-2xl bg-foreground/5 px-4 py-2.5 text-body">
            <Archive className="size-4 text-muted-foreground" />
            <span className="flex-1">Платформа в архіві — прихована з меню</span>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => update.mutate({ id: platform.id, patch: { archived: false } })}
            >
              <ArchiveRestore /> Повернути
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden px-8 pb-6">
          <TabsContent value="proposals" className="h-full">
            <ProposalsTab platform={platform} onNew={() => setNewOpen(true)} />
          </TabsContent>
          <TabsContent
            value="contracts"
            className="h-full overflow-y-auto has-[>[data-slot=empty]]:flex has-[>[data-slot=empty]]:flex-col"
          >
            <ContractsTab platform={platform} />
          </TabsContent>
          {platform.creditsName && (
            <TabsContent value="credits" className="h-full overflow-y-auto">
              <CreditsTab platform={platform} />
            </TabsContent>
          )}
          <TabsContent value="stats" className="h-full overflow-y-auto">
            <StatsTab platform={platform} />
          </TabsContent>
          <TabsContent value="settings" className="h-full overflow-y-auto">
            <PlatformSettingsTab platform={platform} />
          </TabsContent>
        </div>
      </Tabs>
    </Page>
  )
}
