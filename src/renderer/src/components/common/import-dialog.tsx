import { useMemo, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { Braces, Copy, FileJson, FileUp } from 'lucide-react'
import { IMPORT_DEFS, IMPORT_MAX_ITEMS, importPrompt, type ImportKind } from '@shared/domain/import'
import { api } from '@/lib/api'
import { invalidateAll } from '@/lib/query'
import { plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const MAX_FILE_BYTES = 2 * 1024 * 1024

/** Accepts raw JSON or an AI answer with ```json fences / text around the JSON. */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1]
  const starts = [raw.indexOf('{'), raw.indexOf('[')].filter((i) => i >= 0)
  if (!starts.length) return raw
  const start = Math.min(...starts)
  const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'))
  return end > start ? raw.slice(start, end + 1) : raw
}

type Parsed = { ok: true; data: unknown; count: number; titles: string[] } | { ok: false; error: string } | null

function parse(kind: ImportKind, raw: string): Parsed {
  if (!raw.trim()) return null
  let json: unknown
  try {
    json = JSON.parse(extractJson(raw))
  } catch (e) {
    return { ok: false, error: `Це не схоже на JSON: ${(e as Error).message}` }
  }
  const def = IMPORT_DEFS[kind]
  const res = def.schema.safeParse(json)
  if (!res.success) {
    const issue = res.error.issues[0]
    const where = issue.path.length ? issue.path.join(' → ') : 'корінь'
    return { ok: false, error: `Не той формат (${where}): ${issue.message}` }
  }
  const titles = def.preview(res.data)
  const count = Array.isArray(res.data) ? res.data.length : 1
  return { ok: true, data: res.data, count, titles }
}

/**
 * «Імпорт з JSON» for any kind from IMPORT_DEFS: paste text (or an AI answer) or pick/drop a .json file,
 * copy a ready AI prompt, see a preview or a clear error, then import everything at once.
 * `onImported(firstId)` lets the page open the first created record.
 */
export function ImportDialog({
  kind,
  open,
  onOpenChange,
  onImported
}: {
  kind: ImportKind
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: (firstId: string | undefined) => void
}) {
  const def = IMPORT_DEFS[kind]
  const [raw, setRaw] = useState('')
  const [tab, setTab] = useState<'text' | 'file'>('text')
  const [fileName, setFileName] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parse(kind, raw), [kind, raw])
  const exampleJson = useMemo(() => JSON.stringify(def.example, null, 2), [def])

  const reset = (): void => {
    setRaw('')
    setFileName(null)
  }

  const readFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Файл завеликий — максимум 2 МБ')
      return
    }
    setFileName(file.name)
    setRaw(await file.text())
  }

  const copy = async (text: string, msg: string): Promise<void> => {
    await api.app.copyText(text)
    toast.success(msg)
  }

  const submit = async (): Promise<void> => {
    if (!parsed?.ok) return
    setBusy(true)
    try {
      const res = await api.importer.run({ kind, payload: parsed.data })
      invalidateAll()
      toast.success(`Імпортовано ${res.created} ${plural(res.created, def.forms)}`)
      onOpenChange(false)
      reset()
      onImported?.(res.firstId)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setOver(false)
    void readFile(e.dataTransfer.files[0])
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Імпорт з JSON — {def.label}</DialogTitle>
          <DialogDescription>
            {def.hint} Скопіюйте промт, вставте в Claude чи ChatGPT, опишіть задачу — і вставте відповідь або файл сюди.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button variant="subtle" size="sm" onClick={() => void copy(importPrompt(kind), 'Промт скопійовано')}>
            <Copy /> Скопіювати промт для ШІ
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTab('text')
              setRaw(exampleJson)
            }}
          >
            <Braces /> Вставити приклад
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'text' | 'file')} className="gap-3">
          <TabsList className="w-fit">
            <TabsTrigger value="text">Текст</TabsTrigger>
            <TabsTrigger value="file">Файл</TabsTrigger>
          </TabsList>
          <TabsContent value="text">
            <Textarea
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value)
                setFileName(null)
              }}
              placeholder={exampleJson.length > 400 ? `${exampleJson.slice(0, 400)}…` : exampleJson}
              aria-label="JSON для імпорту"
              aria-invalid={parsed?.ok === false || undefined}
              className="min-h-48 font-mono text-caption"
            />
          </TabsContent>
          <TabsContent value="file">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
              className={cn(
                'flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-foreground/15 p-6 text-center transition-colors',
                over && 'border-chart-1 bg-foreground/[0.04]'
              )}
            >
              <FileJson className="size-6 text-muted-foreground" />
              <p className="text-body">{fileName ?? 'Перетягніть сюди .json файл'}</p>
              <p className="text-caption text-muted-foreground">до 2 МБ, до {IMPORT_MAX_ITEMS} записів</p>
              <Button variant="subtle" size="sm" onClick={() => fileInput.current?.click()}>
                <FileUp /> Вибрати файл
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json,text/plain"
                className="hidden"
                onChange={(e) => {
                  void readFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>
          </TabsContent>
        </Tabs>

        {parsed?.ok === false && <p className="text-caption text-destructive">{parsed.error}</p>}
        {parsed?.ok && (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
            <div className="text-body font-semibold">
              Готово до імпорту: {parsed.count} {plural(parsed.count, def.forms)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {parsed.titles.slice(0, 8).map((t, i) => (
                <Badge key={i} variant="soft" className="max-w-64 truncate">
                  {t}
                </Badge>
              ))}
              {parsed.titles.length > 8 && <Badge variant="soft">ще {parsed.titles.length - 8}</Badge>}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="soft" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button variant="lime" disabled={!parsed?.ok || busy} onClick={() => void submit()}>
            {parsed?.ok ? `Імпортувати ${parsed.count}` : 'Імпортувати'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Copies data in the same JSON format the import accepts (to hand it to an AI for improvement). */
export async function copyAsJson(data: unknown, what: string): Promise<void> {
  await api.app.copyText(JSON.stringify(data, null, 2))
  toast.success(`${what} скопійовано як JSON`)
}

/** «Імпорт з JSON» header button + its dialog. Sits left of the page's primary (lime) button. */
export function ImportButton({ kind, onImported }: { kind: ImportKind; onImported?: (firstId: string | undefined) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="soft" onClick={() => setOpen(true)}>
        <FileJson /> Імпорт з JSON
      </Button>
      <ImportDialog kind={kind} open={open} onOpenChange={setOpen} onImported={onImported} />
    </>
  )
}

/** Small header action: copy what's listed now as import-compatible JSON. */
export function CopyJsonButton({ getData, what, disabled }: { getData: () => unknown; what: string; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Копіювати як JSON" disabled={disabled} onClick={() => void copyAsJson(getData(), what)}>
          <Braces />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Копіювати як JSON — той самий формат, що й імпорт</TooltipContent>
    </Tooltip>
  )
}
