import { useNavigate } from 'react-router'
import { SquareKanban, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { IDEA_STATUSES, type Idea, type IdeaPatch, type IdeaStatus } from '@shared/domain/ideas'
import { useApi, useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { DetailPane, EntityAside, InlineTitle } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { Field, Segmented } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IDEA_STATUS_LABEL, IMPACT_LABEL } from './labels'

/** Editor for a single idea. Keyed by id by the parent so autosave flushes on switch. */
export function IdeaDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: idea } = useApi('ideas', 'get', id)
  if (!idea) return null
  return <IdeaEditor key={idea.id} idea={idea} onClose={onClose} />
}

function IdeaEditor({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const navigate = useNavigate()
  const update = useApiMutation('ideas', 'update', { silent: false })
  const remove = useApiMutation('ideas', 'remove', {
    onSuccess: () => {
      toast.success('Идея перемещена в корзину')
      onClose()
    }
  })
  const convert = useApiMutation('ideas', 'convertToBoard', {
    onSuccess: (board) => {
      toast.success('Доска создана')
      navigate(`/boards/${board.id}`)
    }
  })

  const patch = (p: IdeaPatch): void => update.mutate({ id: idea.id, patch: p })
  const [title, setTitle] = useAutosave(idea.title, (t) => t.trim() && patch({ title: t.trim() }))
  const [body, setBody] = useAutosave(idea.body, (b) => patch({ body: b }))

  return (
    <DetailPane
      entity={{ type: 'idea', id: idea.id }}
      onClose={onClose}
      onDelete={() => remove.mutate(idea.id)}
      headerExtra={
        idea.boardId ? (
          <Button variant="soft" size="sm" onClick={() => navigate(`/boards/${idea.boardId}`)}>
            <ArrowUpRight /> Открыть доску
          </Button>
        ) : (
          <Button variant="lime" size="sm" disabled={convert.isPending} onClick={() => convert.mutate(idea.id)}>
            <SquareKanban /> Превратить в доску
          </Button>
        )
      }
      aside={
        <EntityAside
          entity={{ type: 'idea', id: idea.id }}
          tags={idea.tags}
          onTagsChange={(tagIds) => patch({ tagIds })}
          createdAt={idea.createdAt}
          updatedAt={idea.updatedAt}
        >
          <Field label="Статус">
            <Select value={idea.status} onValueChange={(v) => patch({ status: v as IdeaStatus })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDEA_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {IDEA_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Важность">
            <Segmented
              className="w-full [&>*]:flex-1"
              value={String(idea.impact)}
              onChange={(v) => patch({ impact: Number(v) })}
              options={[0, 1, 2, 3].map((n) => ({
                value: String(n),
                label: n === 0 ? '—' : '●'.repeat(n),
                title: IMPACT_LABEL[n]
              }))}
            />
            <span className="text-[11.5px] text-muted-foreground">{IMPACT_LABEL[idea.impact]}</span>
          </Field>
        </EntityAside>
      }
    >
      <InlineTitle value={title} onChange={setTitle} placeholder="Название идеи" />
      <div className="mt-5">
        <MarkdownField
          value={body}
          onChange={setBody}
          label="Описание"
          placeholder="Опишите идею: зачем, для кого, первые шаги…"
          minHeight="280px"
        />
      </div>
    </DetailPane>
  )
}
