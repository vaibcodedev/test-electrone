import { useNavigate } from 'react-router'
import { SquareKanban, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { IDEA_STATUSES, ideaInputSchema, type Idea, type IdeaPatch, type IdeaStatus } from '@shared/domain/ideas'
import { limitsOf } from '@/lib/limits'
import { useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { DetailPane, EntityAside, InlineTitle } from '@/components/common/master-detail'
import { MarkdownField } from '@/components/common/markdown'
import { Field } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IDEA_STATUS_LABEL, IMPACT_LABEL } from './labels'

const LIMITS = limitsOf(ideaInputSchema)

/**
 * Editor for a single idea. Keyed by id by the parent so autosave flushes on switch. The page loads the idea and
 * passes `null` to MasterDetail until it arrives (an element that renders nothing blanked the pane between records).
 */
export function IdeaDetail({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const navigate = useNavigate()
  const update = useApiMutation('ideas', 'update', { silent: false })
  const remove = useApiMutation('ideas', 'remove', {
    onSuccess: () => {
      toast.success('Ідею переміщено в кошик')
      onClose()
    }
  })
  const convert = useApiMutation('ideas', 'convertToBoard', {
    onSuccess: (board) => {
      toast.success('Дошку створено')
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
            <ArrowUpRight /> Відкрити дошку
          </Button>
        ) : (
          <Button variant="lime" size="sm" disabled={convert.isPending} onClick={() => convert.mutate(idea.id)}>
            <SquareKanban /> Перетворити на дошку
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
          {/* Words, not «•••» dots: the dots read as a «more» menu. A Select like «Статус» fits the narrow aside. */}
          <Field label="Важливість">
            {/* «Не оцінена» is a placeholder, not a value: view mode hides the field (globals.css). */}
            <Select value={idea.impact ? String(idea.impact) : ''} onValueChange={(v) => patch({ impact: Number(v) })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={IMPACT_LABEL[0]} />
              </SelectTrigger>
              <SelectContent>
                {IMPACT_LABEL.map((label, n) => (
                  <SelectItem key={n} value={String(n)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </EntityAside>
      }
    >
      <InlineTitle value={title} onChange={setTitle} placeholder="Назва ідеї" maxLength={LIMITS.title} />
      <div className="mt-5">
        <MarkdownField
          value={body}
          onChange={setBody}
          label="Опис"
          placeholder="Опишіть ідею: навіщо, для кого, перші кроки…"
          maxLength={LIMITS.body}
          minHeight="280px"
        />
      </div>
    </DetailPane>
  )
}
