import { useState, type ReactElement } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  DEFAULT_VERSION_NAME,
  TEMPLATE_VERSIONS_MAX,
  VERSION_NAME_PRESETS,
  versionLabel,
  type TemplatePatch
} from '@shared/domain/freelance'
import { MAX } from '@shared/domain/limits'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/common/page'
import { Combobox } from '@/components/common/combobox'
import { Confirm } from '@/components/common/confirm'
import { DisabledHint } from '@/components/common/disabled-hint'
import { IconAction } from '@/components/common/icon-action'
import { EditableScope, useReadOnly } from '@/components/common/detail-mode-context'

export interface VersionView {
  name: string
  body: string
}

const same = (a: string, b: string): boolean =>
  versionLabel(a).toLocaleLowerCase('uk') === versionLabel(b).toLocaleLowerCase('uk')

/** Name of a new version: the first preset not used yet, else «Версія N». */
export function nextVersionName(versions: VersionView[]): string {
  const free = VERSION_NAME_PRESETS.find((p) => !versions.some((v) => same(v.name, p)))
  if (free) return free
  for (let n = versions.length + 1; ; n++) {
    const name = `Версія ${n}`
    if (!versions.some((v) => same(v.name, name))) return name
  }
}

/**
 * The patch that removes version `i` of a template. The first one is the template's `body`: the second takes its
 * place (text and name), so old data keeps its shape.
 */
export function removeVersionPatch(all: VersionView[], i: number): TemplatePatch {
  const rest = all.filter((_, k) => k !== i)
  return { body: rest[0].body, bodyName: rest[0].name, versions: rest.slice(1) }
}

/** The version names of a template in a row («Українська · English»); null while there is only one. */
export function versionNames(all: VersionView[]): string | null {
  return all.length > 1 ? all.map((v) => versionLabel(v.name)).join(' · ') : null
}

/**
 * The name of a version: a preset («Українська», «Русский», «English»), or an own one through «Створити «…»» — the
 * same Combobox as the situation. Names the template's other versions use are not offered; the first version may
 * stay unnamed («Основна»).
 */
function VersionNameCombobox({
  value,
  others,
  first,
  onChange
}: {
  value: string
  others: string[]
  first: boolean
  onChange: (name: string) => void
}): ReactElement {
  const options = [...new Set<string>([...VERSION_NAME_PRESETS, ...(value ? [value] : [])])]
    .filter((n) => n === value || !others.some((o) => same(o, n)))
    .map((n) => ({ value: n, label: n }))
  return (
    <Combobox
      value={value || null}
      options={options}
      onChange={(v) => onChange(v ?? '')}
      creatable
      onCreate={(text) => text.trim() && onChange(text.trim())}
      clearable={first}
      clearLabel={`Без назви («${DEFAULT_VERSION_NAME}»)`}
      maxLength={MAX.label}
      placeholder={first ? DEFAULT_VERSION_NAME : 'Назва версії'}
      searchPlaceholder="Напр.: English або «Коротка»"
      emptyText="Введіть свою назву"
      className="w-52 max-w-full"
    />
  )
}

/**
 * Text versions of a template above «Текст»: a switch between them (while reading only when there are several),
 * and in «Редагувати» — the name of the shown one, «Версія» to add one and removing it (with a question when it
 * has text; the last one stays).
 */
export function TemplateVersionsBar({
  all,
  active,
  onActive,
  onRename,
  onAdd,
  onRemove
}: {
  all: VersionView[]
  active: number
  onActive: (i: number) => void
  onRename: (i: number, name: string) => void
  onAdd: () => void
  onRemove: (i: number) => void
}): ReactElement | null {
  const readOnly = useReadOnly()
  const [asking, setAsking] = useState(false)
  if (readOnly && all.length < 2) return null
  const current = all[active]
  const full = all.length >= TEMPLATE_VERSIONS_MAX
  return (
    <div className="flex flex-col gap-2" data-template-versions>
      {all.length > 1 && (
        // Which version is shown is not a value of the record: the switch works while reading too
        // (EditableScope + data-view-live, globals.css).
        <div data-view-live>
          <EditableScope>
            <Segmented
              label="Версія тексту"
              size="xs"
              className="data-[variant=segment]:flex-wrap"
              value={String(active)}
              onChange={(v) => onActive(Number(v))}
              options={all.map((v, i) => ({ value: String(i), label: versionLabel(v.name) }))}
            />
          </EditableScope>
        </div>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <VersionNameCombobox
            key={active}
            value={current.name}
            first={active === 0}
            others={all.filter((_, i) => i !== active).map((v) => v.name)}
            onChange={(name) => onRename(active, name)}
          />
          {all.length < 2 ? (
            <DisabledHint reason="Єдину версію не можна видалити">
              <Button variant="ghost" size="icon-sm" aria-label="Видалити версію" disabled>
                <Trash2 />
              </Button>
            </DisabledHint>
          ) : (
            <IconAction
              label="Видалити версію"
              size="icon-sm"
              // A version with text asks first; an empty one just goes.
              onClick={() => (current.body.trim() ? setAsking(true) : onRemove(active))}
            >
              <Trash2 />
            </IconAction>
          )}
          <Confirm
            open={asking}
            onOpenChange={setAsking}
            title={`Видалити версію «${versionLabel(current.name)}»?`}
            description="Її текст зникне з шаблону; «Скасувати» в шаблоні поверне його."
            onConfirm={() => onRemove(active)}
          />
          {full ? (
            <DisabledHint reason={`Не більше ${TEMPLATE_VERSIONS_MAX} версій`}>
              <Button variant="soft" size="sm" disabled>
                <Plus /> Версія
              </Button>
            </DisabledHint>
          ) : (
            <Button variant="soft" size="sm" onClick={onAdd}>
              <Plus /> Версія
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
