import { z } from 'zod'
import { CHECKLIST_IMPORT_EXAMPLE, checklistImportSchema } from './checklists'
import { NON_TECH_CATEGORIES, QUESTION_CATEGORIES, QUESTION_GROUPS, questionInputSchema } from './jobs'
import { wordInputSchema } from './english'
import { snippetInputSchema } from './snippets'
import { redFlagInputSchema, templateInputSchema } from './freelance'
import { ideaInputSchema } from './ideas'
import { bookmarkInputSchema } from './bookmarks'
import { libraryInputSchema } from './libraries'

/**
 * Bulk import from JSON (pasted text, a .json file or an AI answer).
 * One description per kind: payload schema (built from the module's own input schema, so limits match the
 * server), an example, rules for the AI prompt and a preview. Adding a kind = one entry here + one handler
 * registered in main (ImportService) — no switch statements anywhere (docs/design-system.md → Импорт из JSON).
 */
export const IMPORT_KINDS = ['checklist', 'question', 'word', 'snippet', 'template', 'redflag', 'idea', 'bookmark', 'library'] as const
export type ImportKind = (typeof IMPORT_KINDS)[number]

export const IMPORT_MAX_ITEMS = 500

/** `[…]` or `{ "items": […] }` → the array, 1…500 items. */
function arrayPayload<T extends z.ZodType>(item: T): z.ZodType<z.output<T>[], z.input<T>[] | { items: z.input<T>[] }> {
  const list = z.array(item).min(1).max(IMPORT_MAX_ITEMS)
  return z.union([list, z.object({ items: list })]).transform((v) => (Array.isArray(v) ? v : v.items))
}

const questionItem = questionInputSchema
  .pick({ topic: true, question: true, answer: true, lang: true, difficulty: true })
  .extend({
    /** Either the exact category or just the group: «technical» / «nontechnical». */
    category: z.enum(QUESTION_CATEGORIES).optional(),
    group: z.enum(QUESTION_GROUPS).optional()
  })
  .transform(({ group, category, ...rest }) => ({
    ...rest,
    category: category ?? (group === 'nontechnical' ? NON_TECH_CATEGORIES[0] : 'technical')
  }))

const ideaItem = ideaInputSchema
  .pick({ title: true, body: true, status: true, impact: true })
  .extend({ description: z.string().max(100_000).optional() })
  .transform(({ description, ...rest }) => ({ ...rest, body: rest.body || description || '' }))

export interface ImportKindDef {
  /** Shown in the dialog title: «Імпорт — {label}». */
  label: string
  /** One noun per plural form for «Імпортувати N …». */
  forms: [string, string, string]
  /** Short description for the dialog. */
  hint: string
  schema: z.ZodType
  example: unknown
  /** Extra lines for the AI prompt. */
  rules: string[]
  /** Titles for the preview after a successful parse. */
  preview: (data: unknown) => string[]
}

const titles = <T>(pick: (item: T) => string) => (data: unknown): string[] => (data as T[]).map(pick)

export const IMPORT_DEFS: Record<ImportKind, ImportKindDef> = {
  checklist: {
    label: 'шаблон чек-листа',
    forms: ['шаблон', 'шаблони', 'шаблонів'],
    hint: 'Один шаблон із розділами й пунктами.',
    schema: checklistImportSchema,
    example: CHECKLIST_IMPORT_EXAMPLE,
    rules: ['3–8 розділів (sections), у кожному 3–12 коротких пунктів-дій', 'пункт — рядок або об’єкт { "text", "hint" }'],
    preview: (data) => {
      const d = data as z.output<typeof checklistImportSchema>
      return d.sections.map((s) => `${s.title || 'Без розділу'} · ${s.items.length}`)
    }
  },
  question: {
    label: 'питання до співбесід',
    forms: ['питання', 'питання', 'питань'],
    hint: 'Питання з вашими відповідями; категорія — technical або група nontechnical.',
    schema: arrayPayload(questionItem),
    example: [
      { question: 'Чим useMemo відрізняється від useCallback?', answer: 'useMemo кешує значення, useCallback — функцію…', group: 'technical', topic: 'React', difficulty: 2, lang: 'uk' },
      { question: 'Розкажіть про складний проєкт', answer: 'Ситуація → дія → результат…', group: 'nontechnical', category: 'behavioral', lang: 'uk' }
    ],
    rules: [
      'group: "technical" або "nontechnical"; для нетехнічних можна category: behavioral | company | salary | other',
      'difficulty: 1–3, lang: uk | en | ru, answer — markdown'
    ],
    preview: titles<{ question: string }>((q) => q.question)
  },
  word: {
    label: 'слова для англійської',
    forms: ['слово', 'слова', 'слів'],
    hint: 'Слова й фрази з робочої переписки — одразу потраплять у повторення.',
    schema: arrayPayload(
      wordInputSchema.pick({ term: true, translation: true, kind: true, transcription: true, example: true, exampleTranslation: true, context: true, notes: true })
    ),
    example: [
      { term: 'rollout', translation: 'викатка', kind: 'word', example: "We'll do a staged rollout", exampleTranslation: 'Зробимо поетапну викатку', context: 'Slack' },
      { term: 'on the same page', translation: 'однаково розуміти', kind: 'idiom' }
    ],
    rules: ['kind: word | phrase | idiom | term', 'example — речення англійською, exampleTranslation — його переклад'],
    preview: titles<{ term: string; translation: string }>((w) => (w.translation ? `${w.term} — ${w.translation}` : w.term))
  },
  snippet: {
    label: 'сніпети',
    forms: ['сніпет', 'сніпети', 'сніпетів'],
    hint: 'Шматки коду з назвою, мовою й описом.',
    schema: arrayPayload(snippetInputSchema.pick({ title: true, description: true, code: true, language: true })),
    example: [{ title: 'Debounce хук', language: 'typescript', description: 'Затримка для пошуку', code: 'export function useDebounced<T>(value: T, ms = 300) { /* … */ }' }],
    rules: ['language: typescript | javascript | tsx | graphql | liquid | css | html | json | bash | sql | markdown | text'],
    preview: titles<{ title: string }>((s) => s.title)
  },
  template: {
    label: 'шаблони повідомлень',
    forms: ['шаблон', 'шаблони', 'шаблонів'],
    hint: 'Шаблони відгуків і відповідей клієнтам; {змінні} заповнюються під час копіювання.',
    schema: arrayPayload(templateInputSchema.pick({ situation: true, title: true, trigger: true, body: true, note: true, niche: true })),
    example: [{ situation: 'follow_up', title: 'Нагадування через 3 дні', trigger: 'Клієнт мовчить після відгуку', body: 'Hi {name}, just following up on my proposal…', note: 'Не частіше раз на тиждень' }],
    rules: [
      'situation: proposal | first_message | estimate | tz_questions | revisions | follow_up | small_talk | closing | cover_letter | recruiter | thank_you | other',
      'body — текст повідомлення (зазвичай англійською), note — підказка українською'
    ],
    preview: titles<{ title: string }>((t) => t.title)
  },
  redflag: {
    label: 'червоні прапорці',
    forms: ['прапорець', 'прапорці', 'прапорців'],
    hint: 'Ознаки поганих вакансій і що з ними робити.',
    schema: arrayPayload(redFlagInputSchema.pick({ title: true, signs: true, action: true, severity: true })),
    example: [{ title: 'Тестове без оплати на тиждень', signs: '«Зробіть невеликий проєкт, щоб ми оцінили»', action: 'Запропонувати платне тестове або пропустити', severity: 3 }],
    rules: ['severity: 1 — обережно, 2 — серйозно, 3 — критично'],
    preview: titles<{ title: string }>((r) => r.title)
  },
  idea: {
    label: 'ідеї',
    forms: ['ідея', 'ідеї', 'ідей'],
    hint: 'Список ідей з описом.',
    schema: arrayPayload(ideaItem),
    example: [{ title: 'Плагін для Shopify: швидкі превʼю колекцій', body: 'Кеш у KV, маршрут Hydrogen', status: 'inbox', impact: 2 }],
    rules: ['status: inbox | thinking | planned | in_progress | done | dropped', 'impact: 0–3, body (або description) — markdown'],
    preview: titles<{ title: string }>((i) => i.title)
  },
  bookmark: {
    label: 'закладки',
    forms: ['закладка', 'закладки', 'закладок'],
    hint: 'Статті, відео, курси й документація для читання.',
    schema: arrayPayload(bookmarkInputSchema.pick({ url: true, title: true, kind: true, status: true, notes: true })),
    example: [{ title: 'Electron Security Checklist', url: 'https://www.electronjs.org/docs/latest/tutorial/security', kind: 'docs', notes: 'Перевірити CSP' }],
    rules: ['kind: article | video | course | docs | repo | other', 'url — повне посилання з https://'],
    preview: titles<{ title: string }>((b) => b.title)
  },
  library: {
    label: 'JS-бібліотеки',
    forms: ['бібліотека', 'бібліотеки', 'бібліотек'],
    hint: 'Бібліотеки з призначенням, командою встановлення й посиланнями.',
    schema: arrayPayload(
      libraryInputSchema.pick({ name: true, purpose: true, notes: true, npmUrl: true, githubUrl: true, docsUrl: true, installCmd: true, status: true })
    ),
    example: [{ name: 'motion', purpose: 'Анімації для React', installCmd: 'npm i motion', npmUrl: 'https://www.npmjs.com/package/motion', githubUrl: 'https://github.com/motiondivision/motion', status: 'want' }],
    rules: ['status: used | favorite | want | testing | dropped', 'посилання — повні, з https://'],
    preview: titles<{ name: string }>((l) => l.name)
  }
}

/** Prompt for Claude / ChatGPT: the answer is pasted back into the import dialog. */
export function importPrompt(kind: ImportKind): string {
  const def = IMPORT_DEFS[kind]
  return [
    `Склади ${def.label} для: <опиши, що потрібно>.`,
    'Відповідай ТІЛЬКИ JSON без пояснень і без тексту довкола, точно в такому форматі:',
    '',
    JSON.stringify(def.example, null, 2),
    '',
    'Правила:',
    ...def.rules.map((r) => `- ${r};`),
    `- не більше ${IMPORT_MAX_ITEMS} записів;`,
    '- мова пояснень — українська.'
  ].join('\n')
}

export const importRunSchema = z.object({ kind: z.enum(IMPORT_KINDS), payload: z.unknown() })
export interface ImportResult {
  created: number
  /** First created record (to open it right away). */
  firstId?: string
}
