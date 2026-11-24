import { useMemo } from 'react'
import { WORD_KINDS, type Word, type WordPatch } from '@shared/domain/english'
import { useApiMutation } from '@/lib/query'
import { useAutosave } from '@/hooks/use-autosave'
import { fmtDateTime, fmtDay } from '@/lib/format'
import { DetailPane, EntityAside, InlineTitle, SectionLabel } from '@/components/common/master-detail'
import { Field, Segmented } from '@/components/common/page'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { KIND_LABEL, STAGE_BADGE, STAGE_LABEL } from './labels'

type Form = Pick<
  Word,
  'term' | 'translation' | 'kind' | 'transcription' | 'example' | 'exampleTranslation' | 'context' | 'notes'
>

function toForm(w: Word): Form {
  return {
    term: w.term,
    translation: w.translation,
    kind: w.kind,
    transcription: w.transcription,
    example: w.example,
    exampleTranslation: w.exampleTranslation,
    context: w.context,
    notes: w.notes
  }
}

/** One SRS fact in plain words; the tooltip explains what it means and how it changes. */
function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="cursor-help gap-0.5 rounded-2xl px-3 py-2.5" tabIndex={0}>
          <div className="text-meta text-muted-foreground">{label}</div>
          <div className="text-lead font-medium tabular-nums">{value}</div>
        </Card>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{hint}</TooltipContent>
    </Tooltip>
  )
}

/** SM-2 ease (1.3…2.5+) as a word: how hard the word is for you. */
function easeLabel(ease: number): string {
  if (ease >= 2.45) return 'легко'
  if (ease >= 2.0) return 'средне'
  return 'трудно'
}

export function WordDetail({ word, onClose }: { word: Word; onClose: () => void }) {
  const update = useApiMutation('english', 'update', { silent: false })
  const remove = useApiMutation('english', 'remove', { successMessage: 'Слово в корзине' })
  const initial = useMemo(() => toForm(word), [word])
  const [form, setForm] = useAutosave<Form>(initial, (next) => {
    if (!next.term.trim()) return
    update.mutate({ id: word.id, patch: next as WordPatch })
  })
  const set = <K extends keyof Form>(key: K, value: Form[K]): void => setForm({ ...form, [key]: value })
  const entity = { type: 'word' as const, id: word.id }

  return (
    <DetailPane
      entity={entity}
      onClose={onClose}
      onDelete={() => {
        remove.mutate(word.id)
        onClose()
      }}
      headerExtra={<Badge variant={STAGE_BADGE[word.stage]}>{STAGE_LABEL[word.stage]}</Badge>}
      aside={
        <EntityAside
          entity={entity}
          tags={word.tags}
          onTagsChange={(tagIds) => update.mutate({ id: word.id, patch: { tagIds } })}
          createdAt={word.createdAt}
          updatedAt={word.updatedAt}
          files={false}
        >
          <section className="flex flex-col gap-2">
            <SectionLabel>Повторение</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5">
              <Stat
                label="Повторить"
                value={fmtDay(word.dueAt) || '—'}
                hint={`Когда слово снова появится в тренировке: ${fmtDateTime(word.dueAt)}.`}
              />
              <Stat
                label="Пауза"
                value={word.intervalDays < 1 ? 'меньше дня' : `${Math.round(word.intervalDays)} дн.`}
                hint="Сколько дней между повторами сейчас. Вспомнили — пауза растёт, забыли — снова короткая."
              />
              <Stat label="Вспомнил подряд" value={String(word.repetitions)} hint="Сколько раз подряд вы вспомнили слово без ошибки." />
              <Stat label="Забывал" value={String(word.lapses)} hint="Сколько раз слово забылось и вернулось в начало." />
              <Stat
                label="Даётся"
                value={easeLabel(word.ease)}
                hint="Насколько легко даётся слово по вашим ответам. Чем труднее, тем чаще оно будет попадаться."
              />
              <Stat
                label="Последний раз"
                value={word.lastReviewedAt ? fmtDay(word.lastReviewedAt) : 'ещё не было'}
                hint="Когда вы последний раз повторяли это слово."
              />
            </div>
          </section>
        </EntityAside>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <InlineTitle value={form.term} onChange={(v) => set('term', v)} placeholder="Слово" />
          <Input
            aria-label="Транскрипция"
            value={form.transcription}
            onChange={(e) => set('transcription', e.target.value)}
            placeholder="[транскрипция]"
            className="mt-1 h-8 max-w-xs bg-transparent px-0 text-muted-foreground focus-visible:bg-transparent focus-visible:px-3"
          />
        </div>
        <Field label="Тип">
          <Segmented
            options={WORD_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            value={form.kind}
            onChange={(k) => set('kind', k)}
          />
        </Field>
        <Field label="Перевод">
          <Input value={form.translation} onChange={(e) => set('translation', e.target.value)} placeholder="Как это по-русски" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Пример">
            <Textarea value={form.example} onChange={(e) => set('example', e.target.value)} placeholder="We had to roll back the deploy." />
          </Field>
          <Field label="Перевод примера">
            <Textarea
              value={form.exampleTranslation}
              onChange={(e) => set('exampleTranslation', e.target.value)}
              placeholder="Пришлось откатить деплой."
            />
          </Field>
        </div>
        <Field label="Где встретил">
          <Input value={form.context} onChange={(e) => set('context', e.target.value)} placeholder="PR review, документация Shopify…" />
        </Field>
        <Field label="Заметки">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Синонимы, нюансы употребления" />
        </Field>
      </div>
    </DetailPane>
  )
}
