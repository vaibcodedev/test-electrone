import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { FileSpreadsheet, FileUp } from 'lucide-react'
import { IMPORT_WORDS_MAX, wordInputSchema, type WordImportResult } from '@shared/domain/english'
import {
  guessColumns,
  mapRows,
  parseWordTable,
  type ColumnMap,
  type ImportRow,
  type WordTable
} from '@shared/english-import'
import { limitsOf } from '@/lib/limits'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { reportError } from '@/lib/error-reporting'
import { useDroppedFiles } from '@/hooks/use-file-drop'
import { fmtNumber, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { freshOnOpen } from '@/components/common/fresh-on-open'
import { FormDialog } from '@/components/common/form-dialog'
import { Field } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const LIMITS = limitsOf(wordInputSchema)
const NO_ROWS: ImportRow[] = []
const fitsEntry = (r: ImportRow): boolean =>
  r.term.length <= LIMITS.term! &&
  r.translation.length <= LIMITS.translation! &&
  r.example.length <= LIMITS.example!
const NONE = '__none'
const PREVIEW_ROWS = 5
const WORD_FORMS: [string, string, string] = ['слово', 'слова', 'слів']

type Target = keyof ColumnMap
const TARGETS: { key: Target; label: string; optional: boolean }[] = [
  { key: 'term', label: 'Слово', optional: false },
  { key: 'translation', label: 'Переклад', optional: true },
  { key: 'example', label: 'Приклад', optional: true }
]

/** «Колонка 2 · rollout» — the name from the file, or the number and a sample value. */
function columnLabel(table: WordTable, i: number): string {
  const name = table.header?.[i]
  if (name) return name
  const sample = table.rows.find((r) => r[i])?.[i] ?? ''
  return sample
    ? `Колонка ${i + 1} · ${sample.length > 24 ? `${sample.slice(0, 24)}…` : sample}`
    : `Колонка ${i + 1}`
}

function ImportWordsForm({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const id = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [table, setTable] = useState<WordTable | null>(null)
  const [map, setMap] = useState<ColumnMap | null>(null)
  // The result of the duplicate check, tied to the rows it was made for: a new mapping makes it stale by itself.
  const [check, setCheck] = useState<{ rows: ImportRow[]; result?: WordImportResult } | null>(null)
  const [attempt, setAttempt] = useState(0)

  const rows = useMemo(() => (table && map ? mapRows(table, map) : NO_ROWS), [table, map])
  // Rows an entry can't hold (a wrong column, an unclosed quote swallowing the file) are counted, not sent.
  const fits = useMemo(() => rows.filter(fitsEntry), [rows])
  const tooLong = rows.length - fits.length
  const tooMany = fits.length > IMPORT_WORDS_MAX

  // What would really be added — the server dedupes against the dictionary (case and spacing aside).
  useEffect(() => {
    if (!fits.length || tooMany) return
    let live = true
    api.english
      .importWords({ rows: fits, dryRun: true })
      .then((result) => live && setCheck({ rows: fits, result }))
      .catch((e) => {
        reportError(e, 'english:importCheck')
        if (live) setCheck({ rows: fits })
      })
    return () => {
      live = false
    }
  }, [fits, tooMany, attempt])
  const current = check?.rows === fits && fits.length && !tooMany ? check : null
  const counted = current?.result ?? null
  const failed = !!current && !current.result

  const readFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Файл завеликий — максимум 5 МБ')
      return
    }
    try {
      const parsed = parseWordTable(await file.text())
      if (!parsed.rows.length) {
        toast.error('У файлі немає рядків зі словами')
        return
      }
      setFileName(file.name)
      setTable(parsed)
      setMap(guessColumns(parsed))
    } catch (e) {
      toast.error('Не вдалося прочитати файл. Перевірте, що це текстовий .csv, .tsv або .txt.')
      reportError(e, 'english:importRead')
    }
  }
  const drop = useDroppedFiles((files) => void readFile(files[0]))

  const submit = async (): Promise<void> => {
    try {
      const r = await api.english.importWords({ rows: fits })
      invalidateAll()
      const skipped = r.duplicates + r.invalid + tooLong
      toast.success(`Імпортовано ${fmtNumber(r.added)} ${plural(r.added, WORD_FORMS)}`, {
        description: skipped
          ? `Пропущено: ${fmtNumber(skipped)} (дублікати або задовгі рядки)`
          : undefined
      })
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const added = counted?.added ?? 0
  const columns = table ? Array.from({ length: table.columns }, (_, i) => i) : []

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-2xl"
      title="Імпорт слів з файлу"
      description="CSV, TSV або експорт Anki «Нотатки як звичайний текст». Слова, що вже є в словнику, пропускаються."
      submitLabel={
        counted ? `Імпортувати ${fmtNumber(added)} ${plural(added, WORD_FORMS)}` : 'Імпортувати'
      }
      invalid={!counted || !added}
      invalidReason={
        !table
          ? 'Виберіть файл'
          : !rows.length
            ? 'У колонці «Слово» порожньо — виберіть іншу колонку'
            : !fits.length
              ? 'Усі рядки задовгі для слова — перевірте колонки й лапки у файлі'
              : tooMany
                ? `Забагато рядків — до ${fmtNumber(IMPORT_WORDS_MAX)} за раз`
                : failed
                  ? 'Не вдалося перевірити дублікати'
                  : counted && !added
                    ? 'Нових слів немає — усі вже є в словнику'
                    : 'Перевіряємо дублікати…'
      }
      onSubmit={submit}
    >
      <div
        {...drop.props}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/15 p-5 text-center transition-colors',
          drop.isOver && 'border-chart-1 bg-foreground/4'
        )}
      >
        <FileSpreadsheet className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-body">{fileName ?? 'Перетягніть сюди файл .csv, .tsv або .txt'}</p>
        <p className="text-caption text-muted-foreground">
          до 5 МБ, до {fmtNumber(IMPORT_WORDS_MAX)} слів
        </p>
        <Button variant="subtle" size="sm" onClick={() => fileInput.current?.click()}>
          <FileUp /> {fileName ? 'Інший файл' : 'Вибрати файл'}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          className="hidden"
          aria-label="Файл зі словами"
          onChange={(e) => {
            void readFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      {table && map && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {TARGETS.map((t) => {
              const value = map[t.key]
              return (
                <Field key={t.key} label={t.label} htmlFor={`${id}-${t.key}`}>
                  <Select
                    value={value === null ? NONE : String(value)}
                    onValueChange={(v) =>
                      setMap({ ...map, [t.key]: v === NONE ? null : Number(v) })
                    }
                  >
                    <SelectTrigger id={`${id}-${t.key}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {t.optional && (
                        <>
                          <SelectGroup>
                            <SelectItem value={NONE}>Не імпортувати</SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                        </>
                      )}
                      <SelectGroup>
                        {columns.map((i) => (
                          <SelectItem key={i} value={String(i)}>
                            {columnLabel(table, i)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )
            })}
          </div>

          <div className="overflow-hidden rounded-2xl bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  {TARGETS.map((t) => (
                    <TableHead key={t.key}>{t.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="max-w-40 truncate font-medium">{r.term}</TableCell>
                    <TableCell className="max-w-40 truncate">{r.translation}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {r.example}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-caption text-muted-foreground" role="status">
            {rows.length > PREVIEW_ROWS &&
              `Показано ${PREVIEW_ROWS} з ${fmtNumber(rows.length)} рядків. `}
            {counted &&
              `Нових: ${fmtNumber(counted.added)} · дублікати: ${fmtNumber(counted.duplicates)}${counted.invalid + tooLong ? ` · пропущено (задовгі): ${fmtNumber(counted.invalid + tooLong)}` : ''}`}
            {!rows.length && 'У вибраній колонці «Слово» немає жодного значення.'}
          </p>
          {failed && (
            <p className="flex items-center gap-2 text-caption text-destructive" role="alert">
              Не вдалося перевірити дублікати.
              <Button variant="link" size="xs" onClick={() => setAttempt((n) => n + 1)}>
                Повторити
              </Button>
            </p>
          )}
        </>
      )}
    </FormDialog>
  )
}

/** «Імпорт → З CSV або Anki»: a file, the column mapping, a preview, «Імпортувати N слів». */
export const ImportWordsDialog = freshOnOpen(ImportWordsForm)
